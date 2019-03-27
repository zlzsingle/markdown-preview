const express = require('express');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const showdown = require('showdown');
const converter = new showdown.Converter();
const mdObject = {}; // { [mdId] : { app , mdPath } }

// 获取端口号
function getPort() {
    return 8080;
}

// 将markdown文件渲染成html
function markdownToHtml(mdPath) {
    const text = fs.readFileSync(mdPath, 'utf-8');
    return converter.makeHtml(text);
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
function startMarkdownServer(mdId, mdPath) {
    if (mdObject[mdId]) {
        return false;
    }
    if (path.extname(mdPath) !== '.md') {
        throw `${mdPath} 不是markdown文件`;
    }
    const port = getPort();
    const app = express();
    app.use('/static', express.static(path.join(__dirname, '..', 'static')));
    app.use('/*', function (req, res) {
        const mdId = req.query.mdId;
        res.redirect(`/static/htmls/index.html?mdId=${mdId}`);
    });
    const url = `http://127.0.0.1:${port}/${Date.now()}?mdId=${mdId}`;
    const chokidar = listenMarkdown(mdPath);
    app.listen(port);
    mdObject[mdId] = {
        app,
        mdPath,
        port,
        url,
        chokidar
    };
    openBrowser(url);
    return true;
}

// 关闭markdown服务
function closeMarkdownServer(mdId) {
    if (mdObject[mdId]) {
        mdObject[mdId].app.close();
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
function listenMarkdown(mdPath) {
    // todo
    return {};
}


module.exports = {
    open: startMarkdownServer,
    close: closeMarkdownServer,
    check: checkMarkdown
};
