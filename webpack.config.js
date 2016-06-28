var webpack = require("webpack");

module.exports = {
	entry: './main.tsx',
	output: {
		filename: 'bin/bundle.js'
	},
	resolve: {
		extensions: ['', '.webpack.js', '.web.js', '.ts', '.tsx', '.js']
	},
	plugins: [
	],
    devtool: 'source-map',
	module: {
		loaders: [
			{ test: /\.tsx?$/, loader: 'ts-loader' }
		]
	}
}