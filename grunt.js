var fs = require('fs');
var markdown = require('node-markdown').Markdown;

module.exports = function(grunt) {
  
  // Project configuration.
  grunt.initConfig({
    ngversion: '1.0.4',
    bsversion: '2.3.0',
    srcModules: [], //to be filled in by find-modules task
    tplModules: [], 
    pkg:'<json:package.json>',
    dist: 'dist',
    filename: 'ui-bootstrap',
    meta: {
      modules: 'angular.module("ui.bootstrap", [<%= srcModules %>]);',
      tplmodules: 'angular.module("ui.bootstrap.tpls", [<%= tplModules %>]);',
      all: 'angular.module("ui.bootstrap", ["ui.bootstrap.tpls", <%= srcModules %>]);'
    },
    lint: {
      files: ['grunt.js','src/**/*.js']
    },
    watch: {
      files: ['<config:lint.files>', 'template/**/*.html'],
      tasks: 'before-test test-run'
    },
    concat: {
      dist: {
        src: ['<banner:meta.modules>'],
        dest: '<%= dist %>/<%= filename %>-<%= pkg.version %>.js'
      },
      dist_tpls: {
        src: ['<banner:meta.all>', '<banner:meta.tplmodules>'],
        dest: '<%= dist %>/<%= filename %>-tpls-<%= pkg.version %>.js'
      }
    },
    min: {
      dist:{
        src:['<%= dist %>/<%= filename %>-<%= pkg.version %>.js'],
        dest:'<%= dist %>/<%= filename %>-<%= pkg.version %>.min.js'
      },
      dist_tpls:{
        src:['<%= dist %>/<%= filename %>-tpls-<%= pkg.version %>.js'],
        dest:'<%= dist %>/<%= filename %>-tpls-<%= pkg.version %>.min.js'
      }
    },
    html2js: {
      src: ['template/**/*.html']
    },
    jshint: {
      options: {
        curly: true,
        immed: true,
        newcap: true,
        noarg: true,
        sub: true,
        boss: true,
        eqnull: true
      },
      globals: {}
    }
  });

  //register before and after test tasks so we've don't have to change cli options on the goole's CI server
  grunt.registerTask('before-test', 'lint html2js');
  grunt.registerTask('after-test', 'build site');

  // Default task.
  grunt.registerTask('default', 'before-test test after-test');

  //Common ui.bootstrap module containing all modules for src and templates
  //findModule: Adds a given module to config
  function findModule(name) {
    function enquote(str) {
      return '"' + str + '"';
    }
    var tplModules = grunt.config('tplModules');
    var srcModules = grunt.config('srcModules');

    grunt.file.expand('template/' + name + '/*.html').map(function(file) {
      tplModules.push(enquote(file));
    });
    grunt.file.expand('src/' + name + '/*.js').forEach(function(file) {
      srcModules.push(enquote('ui.bootstrap.' + name));
    });

    grunt.config('tplModules', tplModules);
    grunt.config('srcModules', srcModules);
  }

  grunt.registerTask('dist', 'Override dist directory', function() {
    var dir = this.args[0];
    if (dir) { grunt.config('dist', dir); }
  });

  function dependenciesForModule(name) {
    var deps = [];
    grunt.file.expand('src/' + name + '/*.js')
    .map(grunt.file.read)
    .forEach(function(contents) {
      //Strategy: find where module is declared,
      //and from there get everything inside the [] and split them by comma
      var moduleDeclIndex = contents.indexOf('angular.module(');
      var depArrayStart = contents.indexOf('[', moduleDeclIndex);
      var depArrayEnd = contents.indexOf(']', depArrayStart);
      var dependencies = contents.substring(depArrayStart + 1, depArrayEnd);
      dependencies.split(',').forEach(function(dep) {
        if (dep.indexOf('ui.bootstrap.') > -1) {
          var depName = dep.trim().replace('ui.bootstrap.','').replace(/['"]/g,'');
          if (deps.indexOf(depName) < 0) {
            deps.push(depName);
            //Get dependencies for this new dependency
            deps = deps.concat(dependenciesForModule(depName));
          }
        }
      });
    });
    return deps;
  }
  grunt.registerTask('build', 'Create bootstrap build files', function() {

    var srcFiles = [], tplFiles = [];
    if (this.args.length) {
      var modules = [].concat(this.args);
      //Find dependencies
      this.args.forEach(function(moduleName) {
        modules = modules.concat(dependenciesForModule(moduleName));
        findModule(moduleName);
      });
      srcFiles = modules.map(function(name) {
        return 'src/' + name + '/*.js';
      });
      tplFiles = modules.map(function(name) {
        grunt.file.expand('template/' + name + '/*.html').forEach(html2js);
        return 'template/' + name + '/*.html.js';
      });
      grunt.config('filename', grunt.config('filename')+'-custom');

    } else {
      srcFiles = ['src/*/*.js'];
      tplFiles = ['template/*/*.html.js'];

      grunt.file.expandDirs('src/*').forEach(function(dir) {
        findModule(dir.split('/')[1]);
      });
    }
    grunt.config('concat.dist.src', grunt.config('concat.dist.src').concat(srcFiles));
    grunt.config('concat.dist_tpls.src', grunt.config('concat.dist_tpls.src').concat(srcFiles).concat(tplFiles));

    grunt.task.run('concat min');
  });

  grunt.registerTask('site', 'Create grunt demo site from every module\'s files', function() {
    this.requires('concat html2js');

    function breakup(text, separator) {
      return text.replace(/[A-Z]/g, function (match) {
        return separator + match;
      });
    }

    function ucwords(text) {
      return text.replace(/^([a-z])|\s+([a-z])/g, function ($1) {
        return $1.toUpperCase();
      });
    }

    var modules = grunt.file.expandDirs('src/*').map(function(dir) {
      var moduleName = dir.split("/")[1];
      if (fs.existsSync(dir + "docs")) {
        return {
          name: moduleName,
          displayName: ucwords(breakup(moduleName, ' ')),
          js: grunt.file.expand(dir + "docs/*.js").map(grunt.file.read).join(''),
          html: grunt.file.expand(dir + "docs/*.html").map(grunt.file.read).join(''),
          description: grunt.file.expand(dir + "docs/*.md").map(grunt.file.read).map(markdown).join('')
        };
      }
    }).filter(function(module){
       return module !== undefined;
    });

    var templateFiles = grunt.file.expand("template/**/*.html.js");
    
    grunt.file.write(
      'dist/index.html',
      grunt.template.process(grunt.file.read('misc/demo-template.html'), {
        modules: modules,
        templateModules: templateFiles.map(function(fileName) {
          return "'"+fileName.substr(0, fileName.length - 3)+"'";
        }),
        templates: templateFiles.map(grunt.file.read).join(''),
        version : grunt.config('pkg.version'),
        ngversion: grunt.config('ngversion'),
        bsversion: grunt.config('bsversion')
      })
    );
    
    grunt.file.expand('misc/demo-assets/*.*').forEach(function(path) {
      grunt.file.copy(path, 'dist/assets/' + path.replace('misc/demo-assets/',''));
    });

    grunt.file.expand('misc/demo-assets/img/*.*').forEach(function(path) {
      grunt.file.copy(path, 'dist/' + path.replace('misc/demo-assets/',''));
    });
  });

  //Html templates to $templateCache for tests
  var TPL='angular.module("<%= file %>", []).run(["$templateCache", function($templateCache){\n' +
    '  $templateCache.put("<%= file %>",\n    "<%= content %>");\n' +
    '}]);\n';
  function escapeContent(content) {
    return content.replace(/"/g, '\\"').replace(/\n/g, '" +\n    "').replace(/\r/g, '');
  }
  function html2js(template) {
    grunt.file.write(template + ".js", grunt.template.process(TPL, {
      file: template,
      content: escapeContent(grunt.file.read(template))
    }));
  }
  grunt.registerMultiTask('html2js', 'Generate js versions of html template', function() {
    var files = grunt._watch_changed_files || grunt.file.expand(this.data);
    files.forEach(html2js);
  });

  // Testacular configuration
  function runTestacular(command, options) {
    var testacularCmd = process.platform === 'win32' ? 'testacular.cmd' : 'testacular';
    var args = [command].concat(options);
    var done = grunt.task.current.async();
    var child = grunt.utils.spawn({
        cmd: testacularCmd,
        args: args
    }, function(err, result, code) {
      if (code) {
        done(false);
      } else {
        done();
      }
    });
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
  }

  grunt.registerTask('test', 'run tests on single-run server', function() {
    var options = ['--single-run', '--no-auto-watch', '--log-level=warn'];
    if (process.env.TRAVIS) {
      options =  options.concat(['--browsers=Firefox']);
    } else {
      //Can augment options with command line arguments
      options =  options.concat(this.args);
    }
    runTestacular('start', options);
  });

  grunt.registerTask('server', 'start testacular server', function() {
    var options = ['--no-single-run', '--no-auto-watch'].concat(this.args);
    runTestacular('start', options);
  });

  grunt.registerTask('test-run', 'run tests against continuous testacular server', function() {
    var options = ['--single-run', '--no-auto-watch'].concat(this.args);
    runTestacular('run', options);
  });

  grunt.registerTask('test-watch', 'start testacular server, watch & execute tests', function() {
    var options = ['--no-single-run', '--auto-watch'].concat(this.args);
    runTestacular('start', options);
  });

  var packageVersion;

  grunt.registerTask('before-release-build', 'Make sure version is clean of snapshot', function() {
    packageVersion = new PackageVersion('package.json');
    //Bump version in package.json (rename from *[0-9].[0-9].[0-9]-SNAPSHOT to *[0-9].[0-9].[0-9])
    packageVersion.save(false);
  });

  grunt.registerTask('after-release-build', 'Releases the build', function() {

    var done = grunt.task.current.async();

    function releaseCommitTagPush() {
      //Commit the version change with the following message: chore(release): [versio number]
      runGit(['commit', '-a', '-m', 'chore(release): ' + packageVersion.prettyVersion()], done).on('exit', function() {
        //tag (git tag [version number])
        runGit(['tag', packageVersion.prettyVersion()], done).on('exit', function() {
          //push changes (git push --tags)
          runGit(['push', '--tags'], done).on('exit', function() {
            runGit(['push'], done).on('exit', function() {
              //switch to gh-pages (git checkout gh-pages)
              runGit(['checkout', 'gh-pages'], done).on('exit', function() {
                releaseCopyDist();
              });
            });
          });
        });
      });
    }

    //Copy dist to main folder
    function releaseCopyDist() {
      grunt.file.expand('dist/**/*.*').forEach(function(path) {
        grunt.file.copy(path, path.replace('dist/',''));
      });
      releaseVersionChangeGhPages();
    }

    //Commit version changes to gh-pages
    function releaseVersionChangeGhPages() {
      //Commit the version change with the following message: chore(release): [versio number]
      runGit(['add', '-A'], done).on('exit', function() {
        runGit(['commit', '-m', 'chore(release): ' + packageVersion.prettyVersion()], done).on('exit', function() {
          //push changes 
          runGit(['push'], done).on('exit', function() {
            //switch to gh-pages (git checkout gh-pages)
            runGit(['checkout', 'master'], done).on('exit', function() {
              releaseBumpFinalize();
            });
          });
        });
      });
    }

    //Bump version and commit starting
    function releaseBumpFinalize() {
      packageVersion.incrementBuild();
      packageVersion.save(true);
      runGit(['commit', '-a', '-m', 'chore(release): starting ' + packageVersion.prettyVersion()], done).on('exit', function() {
        //push changes 
        runGit(['push'], done).on('exit', function() {
          done();
        });
      });
    }

    //Start async task chain
    releaseCommitTagPush();

  });

  //release-commit-tag-push release-copy-dist release-versionchange-gh release-bumpfinalize
  grunt.registerTask('release', 'before-release-build default after-release-build');

  function runGit(options, done) {
    var gitCmd = 'git';
    var args = options;
    grunt.log.ok('Do git ' + args.join(' '));
    var child = grunt.utils.spawn({
        cmd: gitCmd,
        args: args
    }, function(err, result, code) {
      if (code) {
        grunt.fatal(code + ':' + result);
        done(false);
      }
    });
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
    return child;
  }

  function PackageVersion(sourceFileName){
    this.sourceFile = sourceFileName;
    this.versionPackage = grunt.file.readJSON(this.sourceFile);

    var versionMatcher = new RegExp('(\\d{1,3}).(\\d{1,3}).(\\d{1,3})*');
    var versionResult = versionMatcher.exec(this.versionPackage.version);
    if (versionResult.length != 4) {
      grunt.warn('Error parsing version number');
    }
    this.currentCleanVersion = { major: 0, minor: 0, build: 0};
    this.currentCleanVersion.major = versionResult[1];
    this.currentCleanVersion.minor = versionResult[2];
    this.currentCleanVersion.build = versionResult[3];
  }

  PackageVersion.prototype.incrementMajor = function(){
    this.currentCleanVersion.major++;
    this.currentCleanVersion.minor = 0;
    this.currentCleanVersion.build = 0;
  };
  PackageVersion.prototype.incrementMinor = function(){
    this.currentCleanVersion.minor++;
    this.currentCleanVersion.build = 0;
  };
  PackageVersion.prototype.incrementBuild = function(){
    this.currentCleanVersion.build++;
  };  
  PackageVersion.prototype.prettyVersion = function() {
    return this.currentCleanVersion.major + '.' +
      this.currentCleanVersion.minor + '.' +
      this.currentCleanVersion.build;
  };
  PackageVersion.prototype.save = function(withSnapshot){
    this.versionPackage.version = this.prettyVersion();
    if (withSnapshot) {
      this.versionPackage.version += '-SNAPSHOT';
    }
    grunt.file.write(this.sourceFile, JSON.stringify(this.versionPackage, null, 2) + '\n');
    grunt.config.set('pkg', this.versionPackage);
  };

  return grunt;
};
