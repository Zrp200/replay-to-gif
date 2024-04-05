const {launch} = require("puppeteer");
const yargs = require("yargs")

const {download, turnSpec, awaitSync} = require("./util.jsx")

const global = {
    bulk: {
        alias: 'b',
        describe: "How many instances to run at once, if giving more than one argument",
        default: true,
    },
    headless: { boolean: true, default: true }
};

// options configurable per replay. also configurable globally
const save = {
    'reverse': {
        alias: 'r',
        describe: 'reverse viewpoint of battle',
        type: 'boolean',
        group: 'save',
    },
    'show': {choices: [false, 'teams', "chat"], group: 'save'},
    'gif': {
        describe: "generate a gif with this input",
        type: 'boolean',
        group: 'save',
    },
    'speed': {
        describe: 'adjust time between messages. affects output speed. hyperfast disables animations',
        choices: ['very slow', 'slow', 'normal', 'fast', 'hyperfast'],
        group: 'save'
    },
    'vspeed': {
        describe: 'output video speed',
        type: 'number',
        group: 'save',
    },
    'turns': {
        desc: 'Show the turn indicator, default true',
        type: "boolean",
        group: 'save',
    }
}

yargs()
    .usage("$0 [<src> [[turns] [save_opts]]..")

    .positional('src', {
        desc: 'Link to the replay. The "https://play.pokemonshowdown" is optional.'
    })
    .positional('turns', {
        desc: 'turn range to capture. a descriptor can be used in addition or instead of a start or end range. Omitting or using "all" captures the whole thing.'
    })
    .example("$0 oumonotype-82345404 1-2faint 0-end")

    .options(global)
    .options(save)
    .default({
        'reverse': false,
        'show': false,
        'gif': true,
        'speed': 'normal',
        'vspeed': 1,
        'turns': true
    })
    .strictOptions() // verify all options are legitimate
    .parse(process.argv)

let {argv: {_: argv, bulk = true, headless = true}} = yargs(process.argv.slice(2))
    .parserConfiguration({"unknown-options-as-args": true})
    .options(global)

const browser = launch({headless, waitForInitialPage: false, args: ["--no-startup-window"]});
// split parts into sections
const parts = function* () {
    let parser = yargs().options(save)
    let last = {}, i = 0, j = argv.length;
    while (i < j) {
        let {_: [src, turns, ...other], $0, ...opts} = parser.parse(argv.slice(i, j--));
        if (other.length || !src) continue;
        let m = turnSpec.exec(src)
        let cmd = {src, turnData: m, ...opts};
        if (turns) {
            if (m) continue; // two turn arguments
            m = turnSpec.exec(turns);
            if (!m) continue; // two src arguments
            cmd.turnData = m;
        }
        // todo incorporate as middleware or something
        else if (!last.src) throw Error('no src!'); // can't infer src
        else delete cmd.src;
        if (cmd.turnData) cmd.turnData = cmd.turnData.groups; else delete cmd.turnData;
        yield last = {...last, ...cmd};
        i = j + 1;
        j = argv.length;
    }
}();

// parallelism check
let actions = [...parts].map((value,id,) => () => browser
    .then(browser => browser.createBrowserContext())
    .then(context => context.newPage())
    .then(page => download(page, value))
)
let n = parts.length === 1 || (bulk || bulk === 1) && (bulk >= parts.length || bulk === true ? true : Math.ceil(parts.length / bulk));
(!n ? awaitSync(actions)
    : Promise.all(
        n === true ? actions.map(it => it()) :
            function () {
                // map into buckets, todo improve algorithm
                let res = []
                let i = 0;
                while (i < n) res.push(awaitSync(actions.slice(n * i, n * ++i)))
                return res;
            }()
    )).then(() => browser.then(b => b.close()))