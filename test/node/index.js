var appCore = require('../../index');

appCore.logLevel(4);

require('./test.js');
require('./Module1.js');
require('./Module2.js');

appCore.logLevel(4);
appCore.bootstrap(function (Test) {
	var test = new Test();
	
	test.test();
});