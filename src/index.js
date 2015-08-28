'use strict';


/**
 * Module dependencies.
 */

const _ = require('lodash');
const Vorpal = require('vorpal');
const moment = require('moment');
const chalk = require('chalk');
const argv = require('minimist')(process.argv.slice(2));
const indexer = require('./indexer');
const spider = require('./spider');
const utili = require('./util');
const clerk = require('./clerk');
const cosmetician = require('./cosmetician');

const vorpal = new Vorpal();

clerk.start();

// Goodbye in one of 12 languages on sigint.
vorpal.sigint(function(){
  const goodbye = ['Adios', 'Goodbye', 'Au Revoir', 'Ciao', 'Pa', 'Ade', 'Dag', 'Farvel', 'Poka', 'Ćao', 'Shalom', 'Aloha'];
  const address = goodbye[Math.floor(Math.random() * goodbye.length)];
  vorpal.log(chalk.cyan(address + '!'));
  vorpal.ui.pause();
  process.exit(0);
});

const help = vorpal.find('help');
if (help) {
  help.remove();  
}

vorpal
  .delimiter('?')
  .show();

vorpal
  .command('index', 'Rebuilds index.')
  .action(function(args, cb){
    clerk.index.build(function(index){
      cb();
    });
  });

vorpal
  .command('search [command...]', 'Searches for a command.')
  .action(function(args, cb){
    var command = (args.command || []).join(' ');
    let matches = clerk.search(command);
    this.log(matches)
    cb();
  });

vorpal
  .command('stackoverflow [command...]', 'Searches Stack Overflow.')
  .alias('so')
  .alias('stack')
  .action(function(args, cb){
    var command = (args.command || []).join(' ');
    var self = this;
    const sites = ['stackoverflow'];
    self.log(' ');

    function process(itm) {
      spider.stackoverflow.getPage(itm, function(err, text) {
        if (err) {
          self.log('Error: ', err);
        } else {
          self.log(text);
        }
        cb();
      });
    }

    spider.google(command, function(err, next, links){
      let wanted = spider.filterGoogle(links, ['stackoverflow']);
      let item = wanted.shift();
      if (item) {
        process(item);
      } else {
        self.log(chalk.yellow('  Wat couldn\'t find any matches on Stack Overflow.') + '\n  Try re-wording your question.\n');
        cb();
      }
    });

  });

vorpal
  .command('compare', 'Compare\'s index doc dates to existing dates in local docs.')
  .action(function(args, cb){
    clerk.compareDocs();
    cb();
  });

vorpal
  .command('update', 'Forces an update of the document index.')
  //.option('-a, --all', 'Downloads all Wat documents (takes a bit).')
  .action(function(args, cb){
    const self = this;
    if (args.options.all) {
      //clerk.fetchAll();
      cb();
    } else {
      clerk.index.update({ force: true }, function(err, data){
        if (!err) {
          self.log(chalk.cyan('\n  Successfully updated index.'));
          let amt = clerk.updater.queue.length;
          if (amt > 1) {
            self.log(`\n  ${amt} documents are queued for updating.`);
          }
          self.log(' ');
          cb();
        }
      });

    }

  });

vorpal
  .command('show updates', 'Shows what docs are mid being updated.')
  .option('-m, --max', 'Maximum history items to show.')
  .action(function(args, cb){
    let queue = clerk.updater.queue;
    let max = args.options.max || 30;
    let limit = queue.length -1 - max;
    limit = (limit < 0) ? 0 : limit;
    if (queue.length > 0) {
      this.log(chalk.bold('\n  Command'));
    } else {
      this.log(chalk.bold('\n  No updates in the queue.\n  To do a fresh update, run the "' + chalk.cyan('update') + '" command.'));
    }
    for (let i = queue.length - 1; i > limit; i--) {
      let item = String(queue[i]).split('docs/');
      item = (item.length > 1) ? item[1] : item[0];
      let cmd = String(item).split('/').join(' ');
      cmd = String(cmd).replace('.md', '');
      cmd = String(cmd).replace('.detail', chalk.gray(' (detailed)'));
      cmd = String(cmd).replace('.install', chalk.gray(' (install)'));
      cmd = String(cmd).replace(' index', chalk.gray(' '));
      this.log('  ' + cmd);
    }
    this.log(' ');
    cb();
  })

vorpal
  .command('show hist', 'Shows recent command history.')
  .option('-m, --max', 'Maximum history items to show.')
  .action(function(args, cb){
    let types = {
      'command': 'Command',
      'update': 'Update'
    }
    let hist = clerk.history.get();
    let max = args.options.max || 20;
    let limit = hist.length -1 - max;
    limit = (limit < 0) ? 0 : limit;
    this.log(chalk.bold('\n  Date            Type      Value'));
    for (let i = hist.length - 1; i > limit; --i) {
      let date = chalk.gray(utili.pad(moment(hist[i].date || '').format('D MMM h:mma'), 15, ' '));
      let type = utili.pad(types[hist[i].type], 9, ' ');
      let cmd = hist[i].value;
      this.log('  ' + date + ' ' + type + ' ' + cmd);
    }
    this.log(' ');
    cb();
  })

vorpal
  .catch('[commands...]')
  .option('-d, --detail', 'View detailed markdown on item.')
  .option('-i, --install', 'View installation instructions.')
  .autocompletion(function(text, iteration, cb) {
    const self = this;
    const index = clerk.index.index();
    const result = utili.autocomplete(text, iteration, index, function(word, options){
      let result = self.match.call(self, word, options);
      return result;
    });
    if (_.isArray(result)) {
      result.sort();
    }
    cb(void 0, result);
  })
  .action(function(args, cb){

    const self = this;

    args = args || {}
    args.options = args.options || {}

    // Handle humans.
    if (String(args.commands[0]).toLowerCase() === 'wat') {
      args.commands.shift();
    }

    var path = utili.command.buildPath(args.commands.join(' '), args.options, clerk.index.index());


    function execPath(pathObj) {
      let fullPath = utili.command.buildExtension(pathObj.path, pathObj.index, args.options);
      let noDetail = (args.options.detail && !pathObj.index.__detail);
      let noInstall = (args.options.install && !pathObj.index.__install);

      if (noDetail) {
        self.log(chalk.yellow(`\n  Sorry, there's no detailed write-up for this command. Showing the basic one instead.`));
      } else if (noInstall) {
        self.log(chalk.yellow(`\n  Sorry, there's no installation write-up for this command. Showing the basic one instead.`));
      }

      clerk.fetch(fullPath, function(err, data) {
        if (err) {
          self.log('Unexpected Error: ', err);
        } else {
          self.log(data);
        }
        cb();
      });
    }

    if (path.exists === false) {
      if (path.suggestions) {
        self.log(chalk.yellow(`\n  Sorry, there's no cheat sheet for that command. However, you can try these:\n`));
        for (let i = 0; i < path.suggestions.length; ++i) {
          var str = '  ' + String(String(path.path).split('/').join(' ')).trim() + ' ' + path.suggestions[i];
          self.log(str);
        }
        self.log(' ');
      } else {

        let results = clerk.search(args.commands);


        if (results.length === 1 && results[0].points > 0) {

          self.log(chalk.yellow(`\n  Showing results for "${results[0].command}":`));
          let path = utili.command.buildPath(results[0].command, args.options, clerk.index.index());
          execPath(path);

        } else if (results.length > 0) {

          self.log(chalk.yellow(`\n  Did you mean:`));
          for (let i = 0; i < results.length; ++i) {
            if (i > 7) { break; }
            let cmd = results[i].command;
            cmd = cmd.replace(args.commands, chalk.white(args.commands));
            self.log('  ' + cmd);
          }
          self.log(' ');
        } else {

          self.log(chalk.yellow(`\n  Sorry, there's no command like that.\n`));
        }
      }
      cb();
    } else {
      execPath(path);
    }
  });


const xlt = {
  'd': 'detail',
  'i': 'install'
}

let args = { options: {} } 
for (let item in argv) {
  if (item === '_') {
    args.commands = argv[item];
  } else {
    if (xlt[item]) {
      args.options[xlt[item]] = argv[item];
    } else {
      args.options[item] = argv[item];
    }
  }
}

if (process.argv.length > 2) {
  vorpal.exec(args.commands.join(' '), args)
}

//console.log(args);
