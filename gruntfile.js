"use strict";

var util = require('util'),
	aliasify = require('aliasify'),
	stringify = require('stringify'),
	derequire = require('derequire');

module.exports = function(grunt) {
	grunt.loadNpmTasks("grunt-browserify");

	grunt.initConfig({
		"browserify": {
			"all": {
				src: [
					"./js/*.js"
				],
				dest: "./index.js",
				options: {
					verbose: true,
					debug: true,
					transform: [aliasify, stringify(['.html'])],
					plugin: [
						["browserify-derequire"]
					]
				}
			}
		}
	});
	
	grunt.registerTask("1: Build Source File", ["browserify"]);
	grunt.registerTask("default", ["1: Build Source File"]);
};