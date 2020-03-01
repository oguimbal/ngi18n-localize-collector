import fs from 'fs';
import path from 'path';
import giparser from 'gitignore-parser';
const { parseMessage } = require('./extract-loc-msg');
import xmlParser from 'xml-js';

// https://github.com/angular/angular/blob/32e315755bc0504b2b6443d263cd47901761c030/packages/localize/src/utils/messages.ts

interface Loc {
    id: string;
    file: string;
    line: number;
    source: string;
    parts: string[];
    rawParts: string[];
    placeholders: string[];
}


interface Translation {

}

function* collect(source: string): IterableIterator<Loc> {
    source = source
        ? path.resolve(process.cwd(), source)
        : process.cwd();
    // parse gitignore
    // todo: parse .gitignore files in nested directories.
    let ignore: { accepts(path: string): boolean; denies(path: string): boolean; };
    const gitIgnorePath = path.join(source, '.gitignore');
    if (fs.existsSync(gitIgnorePath)) {
        const content = fs.readFileSync(gitIgnorePath, 'utf8');
        ignore = giparser.compile(content);
    } else {
        ignore = giparser.compile('');
    }


    function* walk(dirRelative: string) {
        try {
            const files = fs.readdirSync(path.join(source, dirRelative));
            for (const file of files) {
                const filepath = path.join(source, dirRelative, file);
                const fileRelative = path.join(dirRelative, file);
                if (ignore.denies(fileRelative)) {
                    continue;
                }
                const stats = fs.statSync(filepath);
                if (stats.isDirectory()) {
                    yield* walk(fileRelative);
                } else {
                    if (ignore.accepts(fileRelative)) {
                        yield fileRelative;
                    }
                }
            }
        } catch (e) {
            console.error('Failed to read directory ' + dirRelative);
        }
    }

    const ids = new Map<string, Loc>();
    let fcount = 0;
    for (const f of walk('')) {
        const ext = f.toLowerCase();
        if (!ext.endsWith('.ts')) {
            continue;
        }
        fcount++;
        try {
            const content = fs.readFileSync(path.join(source, f), 'utf8');

            yield* collectFromSource(content, ids, f);

        } catch (e) {
            console.error('Failed to read file ' + f);
        }
    }

    // return { collected: result, files: fcount };
}


function* collectFromSource(content: string, ids: Map<string, Loc>, f?: string): IterableIterator<Loc> {


    // === parse loc() calls
    const re = /\$localize\s*`([^`]+)`/g;
    let m: RegExpExecArray;
    while (m = re.exec(content)) {
        const val = m[1];

        // parse format
        const reFormat = /\$\{([^\}]+)\}/g;
        let fm: RegExpExecArray;
        let index = 0;
        const parts: string[] = [];
        const rawParts: string[] = [];
        const placeholders: string[] = [];
        (parts as any).raw = rawParts;
        while (fm = reFormat.exec(val)) {
            const literal = val.substr(index, fm.index - index);
            placeholders.push(fm[1]);
            parts.push(literal);
            rawParts.push(literal);
            index = fm.index + fm[0].length;
        }
        // add trailing
        parts.push(val.substr(index));
        rawParts.push(val.substr(index));

        const raw = parts.join('');
        const parsed = parseMessage(parts as any);
        const id = parsed.messageId;
        const exists = ids.get(id);
        // check no dupplicate
        if (exists && exists.source !== raw) {
            if (f === exists.file) {
                console.error(`Duplicate translation id '${id}' found in ${f} but was already defined in ${exists.file}`);
            } else {
                console.error(`Duplicate translation id '${id}' found in ${f}`);
            }
            continue;
        }


        const found: Loc = {
            file: f,
            id,
            line: 0, // todo
            source: raw,
            parts,
            rawParts,
            placeholders,
        };
        yield found;
        ids.set(id, found);
    }
}


export function doCollect(translationsDir: string, sourceDir: string) {

    const messagesPath = path.resolve(translationsDir, 'messages.xlf');
    const content = fs.readFileSync(messagesPath, 'utf8');
    const xml = xmlParser.xml2js(content);
    const files = xml.elements[0].elements;
    if (files.length !== 1) {
        throw new Error('Expecting exactly 1 <file> tag under <xliff>');
    }
    const bodies = files[0].elements;
    if (bodies.length !== 1) {
        throw new Error('Expecting exactly 1 <body> tag under <file>');
    }
    const elts = bodies[0].elements;

    // collect elements by ID
    const byId = {};
    for (const e of elts) {
        if (e.name !== 'trans-unit') {
            throw new Error('Unkown body element: ' + e.name);
        }
        if (!e.attributes.id) {
            continue;
        }
        byId[e.attributes.id] = e;
        const allLocElts = e.elements.filter(x => x.name === 'context-group' && x.attributes.purpose === 'location');
        // if (allLocElts.length > 1) {
        //     console.warn(`Multiple locations found for translation id "${e.attributes.id}" => Was that your intention ?`)
        // }
    }

    // collect translations
    for (const loc of collect(sourceDir)) {
        let elt = byId[loc.id];
        if (!elt) {
            // new data
            elts.push(elt = {
                type: 'element',
                name: 'trans-unit',
                attributes: {
                    id: 'otherId',
                    datatype: 'text',
                },
                elements: [
                    // add source
                    {
                        type: 'element',
                        name: 'source',
                        elements: [
                            { type: 'text', text: 'SOME SOURCE' }
                        ]
                    },

                    // add context
                    {
                        type: 'element',
                        name: 'context-group',
                        attributes: { purpose: 'location' },
                        elements: [
                            { type: 'element', name: 'context', attributes: { 'context-type': 'sourcefile' }, elements: [{ type: 'text', text: 'file.ts' }] },
                            { type: 'element', name: 'context', attributes: { 'context-type': 'linenumber' }, elements: [{ type: 'text', text: '42' }] }
                        ]
                    }
                ]
            });
        }


        elt.attributes.id = loc.id;
        // update location
        const allLocElts = elt.elements.filter(x => x.name === 'context-group' && x.attributes.purpose === 'location');
        if (allLocElts.length > 1) {
            console.warn(`Multiple locations found for translation id "${elt.attributes.id}" => Was that your intention ?`)
        }
        const locElts = allLocElts[0];

        const srcFile = locElts.elements.find(x => x.attributes['context-type'] === 'sourcefile');
        srcFile.elements[0].text = loc.file;
        // update source
        const src = elt.elements.find(x => x.name === 'source');
        src.elements = [];
        //  src.elements is like [ { type: 'text', text: 'SOME SOURCE' } ]
        for (let i = 0; i < loc.parts.length; i++) {
            src.elements.push({ type: 'text', text: loc.parts[i]});
            if (loc.placeholders.length > i) {
                // <x id="INTERPOLATION" equiv-text="{{getPercentValue()}}"/>
                src.elements.push({
                    type: 'element',
                    name: 'x',
                    attributes: {
                        id: 'PH' + (i >= 1 ? ('_' + i) : ''),
                        'equiv-text': '${' + loc.placeholders[i] + '}'
                    }
                });
            }
        }
    }

    let xmlGen = xmlParser.js2xml(xml, {
        spaces: 4,
    });

    xmlGen = xmlGen.replace(/\n([\s\n])+(\n\s*)/g, (a, b, c, d, e) => {
        return c;
    });

    fs.writeFileSync(messagesPath, xmlGen);
}