var appCore = require('../../js/AppCore');

appCore.logLevel(4);

require('./test.js');
require('./Module1.js');
require('./Module2.js');

appCore.logLevel(4);

appCore.config(function () {
	console.log('AppCore config block executed');
});

appCore.bootstrap(function (Test) {
	var test = new Test();
	
	test.test();
});