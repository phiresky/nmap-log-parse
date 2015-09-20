all: bin/styles.min.css bin/program.js bin/libs.min.js

bin/styles.min.css: lib/bootstrap.min.css
	cat $^ > bin/styles.min.css

bin/program.js: $(wildcard src/*.ts)
	tsc

bin/libs.min.js: lib/jquery.min.js lib/bootstrap.min.js lib/highcharts.js
	cat $^ > bin/libs.min.js

bin/program.min.js: bin/program.js
	uglifyjs --source-map bin/program.min.js.map --in-source-map bin/program.js.map --source-map-url program.min.js.map --output bin/program.min.js -m -c -- bin/program.js

watch:
	touch bin/program.js
	tsc --watch &
	while inotifywait -e close_write bin/program.js; do \
		$(MAKE) bin/program.min.js; \
	done
