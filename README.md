When running `ng xi18n`, you may have noticed that Angular does not (yet) collect new `$localize` statements in your source files.

This small commandline tools addresses this.

**DISCLAIMER** This is a hack... it is in no way the recommanded way to do this, and the `$localize` statement will probably be supported by the Angular cli soon.


# Usage

Install it

```bash
npm i ngi18n-localize-collector -D
```

Add a pass to collect `$localize` statements when collecting all translations.
For instance, add this in your `package.json` scripts
```json
{
    "scripts": {
        "collect": "ng xi18n --output-path i18n && ngi18n-localize-collector collect && xliffmerge --profile xliffmerge.json en"
    }
}
```


... this should do it ! You will see your `$localize` translations pop in `messages.xlf`