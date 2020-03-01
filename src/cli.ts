#!/usr/bin/env node

import path from 'path';
import yargs, { BuilderCallback, Argv } from 'yargs';
import { doCollect } from './extract-loc';




yargs
    .scriptName('ngi18n-localize-collector')
    .command('collect', '', b => b.positional('translationsDir', {
        describe: 'The translation output directory',
        default: 'i18n',
        normalize: true,
    }).positional('sourceDir', {
        describe: 'The translation output directory',
        default: '.',
        normalize: true,
    })
    , args => {
        const translationsDir = path.join(process.cwd(), args.translationsDir);
        const sourceDir = path.join(process.cwd(), args.sourceDir);
        doCollect(translationsDir, sourceDir);
    })
    .argv;