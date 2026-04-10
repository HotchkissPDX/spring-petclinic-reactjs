// Dev server for webpack 5 + webpack-dev-server 4 (see webpack.config.js).

process.env.NODE_ENV = 'development';

const path = require('path');
const chalk = require('chalk');
const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const config = require('./webpack.config');

const port = parseInt(process.env.PORT || '3000', 10);

const compiler = webpack(config);

const devServerOptions = {
  static: {
    directory: path.join(__dirname, 'public'),
    publicPath: '/',
  },
  historyApiFallback: {
    index: '/index.html',
    disableDotRule: true,
  },
  hot: true,
  compress: true,
  port,
  devMiddleware: {
    publicPath: config.output.publicPath,
    stats: 'errors-warnings',
  },
  client: {
    logging: 'none',
  },
};

const server = new WebpackDevServer(devServerOptions, compiler);

server
  .start()
  .then(() => {
    console.log(chalk.green('Compiled.'));
    console.log();
    console.log('The app is running at:');
    console.log();
    console.log('  ' + chalk.cyan(`http://localhost:${port}/`));
    console.log();
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
