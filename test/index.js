const path = require('path');
const markdownServer = require('../src/markdown');
const mdPath = path.join(__dirname, '..', 'README.md');
const mdId = Math.random().toString(36).substr(2);
markdownServer.open(mdId, mdPath);


global.test = markdownServer;
global.test.mdId = mdId;
global.test.mdPath = mdPath;
