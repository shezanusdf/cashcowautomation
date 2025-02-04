import express, { type Express } from "express";
import webpack from "webpack";
import webpackDevMiddleware from "webpack-dev-middleware";
import webpackHotMiddleware from "webpack-hot-middleware";
// @ts-ignore
import webpackConfig from "../webpack.config.cjs";

export async function setupDevServer(app: Express) {
  const compiler = webpack(webpackConfig);
  // Ensure output and publicPath exist
  const publicPath = webpackConfig.output && webpackConfig.output.publicPath 
                        ? webpackConfig.output.publicPath 
                        : "/";
                        
  app.use(
    webpackDevMiddleware(compiler, {
      publicPath,
      stats: { colors: true },
    })
  );
  app.use(webpackHotMiddleware(compiler));

  console.log("Webpack dev server middleware applied.");
} 