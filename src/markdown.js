const express = require('express');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const net = require('net');
const WebSocketServer = require('ws').Server;
const mdObject = {}; // { [mdId] : { app , mdPath } }

function checkPort(port) {
    const server = net.createServer().listen(port);
    return new Promise((resolve, reject) => {
        server.on('listening', () => {
            server.close();
            resolve(port);
        });
        server.on('error', (err) => {
            reject(err);
        });
    })
}

function randomNum(minNum, maxNum) {
    switch (arguments.length) {
        case 1:
            return parseInt(Math.random() * minNum + 1, 10);
            break;
        case 2:
            return parseInt(Math.random() * (maxNum - minNum + 1) + minNum, 10);
            break;
        default:
            return 0;
            break;
    }
}

// 获取端口号
async function getPort() {
    while (true) {
        const port = randomNum(7000, 9999);
        try {
            await checkPort(port);
            return port;
        } catch (err) {
            console.error(`端口${port}被占用,换一个`);
        }
    }
}

// 将markdown文件渲染成html
function getMarkdownHtml(mdPath) {
    return fs.readFileSync(mdPath, 'utf-8');
}

function openWebSocket(server, mdPath) {
    const wss = new WebSocketServer({server: server});
    wss.on('connection', function (ws) {
        // ws.on('message', function (data, flags) {
        //
        // });
        // 连接关闭，从 Map 中移除，否则长期占据内存
        // ws.on('close', function () {
        //
        // });
        const html = getMarkdownHtml(mdPath);
        if (!wss.clientList) {
            wss.clientList = {};
        }
        if (!ws.uuid) {
            const uuid = Math.random().toString(36).substr(2);
            wss.clientList[uuid] = ws;
            ws.uuid = uuid;
        }
        ws.send(html);
    });
    return wss;
}

// 打开浏览器
function openBrowser(url) {
    let cmd;
    try {
        if (process.platform === 'wind32') {
            cmd = 'start "%ProgramFiles%\Internet Explorer\iexplore.exe"';
        } else if (process.platform === 'linux') {
            cmd = 'xdg-open';
        } else if (process.platform === 'darwin') {
            cmd = 'open';
        }
        cmd = `${cmd} "${url}"`;
        cp.execSync(cmd);
    } catch (err) {
        console.error('exec cmd :', cmd);
    }
}

// 启一个markdown的页面服务器
async function startMarkdownServer(mdId, mdPath) {
    if (mdObject[mdId]) {
        openBrowser(mdObject[mdId].url);
        return false;
    }
    if (path.extname(mdPath) !== '.md') {
        throw `${mdPath} 不是markdown文件`;
    }
    const port = await getPort();
    const app = express();
    app.use('/static', express.static(path.join(__dirname, '..', 'static')));
    app.use('/images', function (req, res) {
        let imgPath;
        if (fs.existsSync(req.query.imgPath)) {
            imgPath = req.query.imgPath;
        } else {
            imgPath = path.join(path.dirname(mdPath), req.query.imgPath);
        }
        if (fs.existsSync(imgPath)) {
            const img = fs.createReadStream(imgPath);
            img.pipe(res);
        } else {
            res.end();
        }
    });
    app.use('/*', function (req, res) {
        const title = path.basename(mdPath, path.extname(mdPath));
        res.redirect(`/static/htmls/index.html?mdId=${req.query.mdId}&title=${title}`);
    });
    const url = `http://127.0.0.1:${port}/${Date.now()}?mdId=${mdId}`;
    const watch = listenMarkdown(mdPath, mdId);
    const server = app.listen(port);
    const wss = openWebSocket(server, mdPath);
    mdObject[mdId] = {
        server,
        mdPath,
        port,
        url,
        watch,
        wss
    };
    openBrowser(url);
    return true;
}

// 关闭markdown服务
function closeMarkdownServer(mdId) {
    if (mdObject[mdId]) {
        const list = mdObject[mdId].wss.clientList;

        Object.keys(list).forEach(key => {
            list[key].close();
        });

        mdObject[mdId].server.close();
        mdObject[mdId].watch.close();
        delete mdObject[mdId];

        return true;
    }
    return false;
}

// 检查这个markdown文件是否存在于server, true存在,false不存在
function checkMarkdown(mdPath) {
    const keys = Object.keys(mdObject);
    if (keys.length > 0) {
        for (let i = 0; i < keys.length; i++) {
            const item = mdObject[i];
            if (item.mdPath === mdPath) {
                return true;
            }
        }
    }
    return false;
}

// 监听markdown文件内容
function listenMarkdown(mdPath, mdId) {
    fs.watchFile(mdPath, {interval: 500}, () => {
        const item = mdObject[mdId];
        if (item) {
            const html = getMarkdownHtml(item.mdPath);
            const list = item.wss.clientList;
            Object.keys(list).forEach(key => {
                list[key].send(html);
            });
        }
    });
    return {
        close: () => fs.unwatchFile(mdPath)
    };
}


module.exports = {
    open: startMarkdownServer,
    close: closeMarkdownServer,
    check: checkMarkdown
};
