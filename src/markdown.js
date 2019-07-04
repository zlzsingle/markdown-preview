const express = require('express');
const fs = require('fs');
const path = require('path');
const watch = require('node-watch');
const open = require('open');
const WebSocketServer = require('ws').Server;
const mdObject = {}; // { [mdId] : { app , mdPath } }
const portfinder = require('portfinder');
const myIp = require('my-ip');

function randomNum(minNum, maxNum) {
    switch (arguments.length) {
        case 1:
            return parseInt(Math.random() * minNum + 1, 10);
        case 2:
            return parseInt(Math.random() * (maxNum - minNum + 1) + minNum, 10);
        default:
            return 0;
    }
}

// 检查端口是否占用
async function checkPort(port) {
    try {
        portfinder.basePort = port;
        await portfinder.getPortPromise();
        return true;
    } catch (e) {
        console.error(`端口${port}被占用,换一个`);
        return false;
    }
}

// 获取端口号
async function getPort() {
    while (true) {
        const port = randomNum(7000, 9999);
        const ok = await checkPort(port);
        if (ok) {
            return port;
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

// 启一个markdown的页面服务器
async function startMarkdownServer(mdId, mdPath, port) {
    if (path.extname(mdPath) !== '.md') {
        throw `${mdPath} 不是markdown文件`;
    }
    const app = express();
    if (port) {
        const ok = await checkPort(port);
        if (!ok) {
            await getPort(port);
        }
    } else {
        port = await getPort(port);
    }
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
    const ipaddr = myIp();
    const url = `http://${ipaddr}:${port}/${Date.now()}?mdId=${mdId}`;
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
    console.log(`http://${ipaddr}:${port}`);
    await open(`http://${ipaddr}:${port}`);
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
    const watcher = watch(mdPath, function () {
        const item = mdObject[mdId];
        if (item) {
            const html = getMarkdownHtml(item.mdPath);
            const list = item.wss.clientList;
            Object.keys(list).forEach(key => {
                try {
                    list[key].send(html);
                } catch (err){

                }
            });
        }
    });
    return {
        close: () => watcher.close()
    };
}


module.exports = {
    open: startMarkdownServer,
    close: closeMarkdownServer,
    check: checkMarkdown
};
