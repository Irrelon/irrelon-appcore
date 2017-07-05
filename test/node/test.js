var appCore = require('../../js/AppCore');

appCore.module('Test', function (Module1) {
		var Test = function () {
			this.module1 = new Module1();
		};
		
		Test.prototype.test = function () {
			console.log('Test test function called');
			this.module1.test();
		};
		
		console.log('Module Test Controller block executed');
		
		return Test;
	})
	
	.config(function () {
		console.log('Module Test Config block 1 executed');
	})
	
	.run(function () {
		console.log('Module Run Config block 1 executed');
	});

appCore.run(['Test', function (test) {
	console.log('Running with moo');
}]);