module.exports = {	
	entry: './main.tsx',
	output: {
		filename: 'bin/bundle.js'
	},
	resolve: {
		extensions: ['', '.webpack.js', '.web.js', '.ts', '.tsx', '.js']
	},
    devtool: 'source-map',
	module: {
		loaders: [
			{ test: /\.tsx?$/, loader: 'ts-loader' }
		]
	}
}