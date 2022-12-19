const fs = require('fs');
const tokenPath = 'tokens.json';
const outputDir = 'src';
let variables = [':root,'];
// let variables = [];
let originData;
let vars = [];
let snippets = {};
let themeName = '';
let parsedData = {};

/*
 * @eg, output content
 * :root,
 * :root[theme-mode="themeName1"],
 * .themeName1{
 *     --white: "#ffffff";
 * }
 * :root[theme-mode="themeName2"],
 * .themeName2{
 *     --white: "#eeeeee";
 * }
*/
const token = fs.readFile(tokenPath, 'utf-8', function(err, data) {
    data = JSON.parse(data);
    let themes = Object.keys(data);
    originData = traverse(data);
    themes.forEach((name, index) => {
        !themeName && (themeName = name);
        // if (Object.keys(data[name]).length === 0 || index > 0) {
        //     return;
        // }
        if (Object.keys(originData[name]).length) {
            let themeStr = [`:root[theme-mode="${name}"], .theme-${name}{`];
            // let themeStr = [`:root {`];
            themeStr = themeStr.concat(tranform(originData[name], name));
            themeStr.push('}\n');
            variables = variables.concat(themeStr);
        }
    });
    makeSnippets();
    makeFile();
});

function makeSnippets() {
    // console.log(parsedData);
    // v: parsedData['\t--' + key]
    vars.forEach(name => {
        let key = cleanName(name);
        snippets[key] = {
            "scope": "css,less,sass",
            "prefix": `var(--${key})`,
            "body": [`var(--${key})`]
        };
    });
}

function makeFile() {
    fs.mkdir(outputDir, function(err){
        fs.writeFileSync(`${outputDir}/variables.css`, variables.join('\n'));
        fs.writeFileSync(`${outputDir}/design-token.code-snippets`, `
            /* vscode snippets for qd-design-token */
            ${JSON.stringify(snippets)}
        `);
    });
}
function traverse(data = {}) {
    let transformed = {};
    // console.log(Object.keys(data));
    Object.keys(data).forEach(name => {
        let item = data[name];
        if (item.value) {
            let value = item.value;
            // 字号、行高加上单位
            if ('sizing|fontSizes|lineHeights|letterSpacing|paragraphSpacing|borderRadius'.indexOf(item.type) > -1 && value.indexOf('%') === -1) {
                value += 'px';
            }
            else if (item.type === 'fontFamilies') {
                value = `${value.replace(/;/g, '')}`;
            }
            // 字体
            else if (item.type === 'typography') {
                value = `${value.fontWeight} ${value.fontSize}/${value.lineHeight} ${value.fontFamily}`;
            }
            // 阴影
            else if (item.type === 'boxShadow') {
                let vstr = [];
                // 0 4px 6px rgba(0, 0, 0, 6%), 0 1px 10px rgba(0, 0, 0, 8%), 0 2px 4px rgba(0, 0, 0, 12%);
                value.forEach(itm => {
                    vstr.push(`${itm.x}px ${itm.y}px ${itm.blur}px ${itm.spread}px ${itm.color}`);
                });
                value = vstr.join(',');
            }
            // eg: #ffffff00
            else if (/^#[\d\w]{8}$/.test(value)) {
                value = toRGBA(value);
            }
            transformed[name] = `${value};${item.description ? ' /* ' + item.description + ' */' : ''}`;
            // console.log(name);
            vars.push(name);
        }
        else {
            transformed[name] = traverse(item);
        }
    });
    return transformed;
}
function tranform(data = {}, themeName, transformed, parentName) {
    transformed = transformed || [];
    Object.keys(data).forEach(name => {
        let str = '';
        let item = data[name];
        if (typeof item === 'string') {
            let n = getVariableName(name, parentName);
            let v = replaceVars(item, themeName, n);
            transformed.push(`${n}: ${v}`);
            !parsedData[n] && (parsedData[n] = v);
        }
        else {
            tranform(item, themeName, transformed, name);
        }
    });
    return transformed;
}
function cleanName(name) {
    return String(name).replace(/^-*/, '');
}
function getVariableName(name, parentName = '') {
    if (parentName && !String(name).startsWith('-')) {
        return `\t--${cleanName(parentName)}-${cleanName(name)}`;
    }
    return `\t--${cleanName(name)}`;
}

/**
 * vars eg:
 * {brand.--color-brand-5}
 * $fontSize.3
 * rgba({black.--black},0.24) 需把值转rgb
 * {--radius-normal}*2px 需计算
*/
function replaceVars(str = '', themeName, itemName) {
    let data = originData[themeName];
    let log = false;
    // if (itemName && itemName.indexOf('--radius-large') > -1) {
    //     log = true;
    //     console.log('name:', itemName, str);
    // }
    // eg:{brand.--color-brand-5}
    str = str.replace(/\{([\w\-\d]+)\.([\w\-\d]*)\}/g, function(matchStr, name1, name2, index, s) {
        let r = name2 ? data[name1][name2] : data[name1];
        r = r.replace(/[";]/g, '');
        log && console.log(`r1: name1: ${name1}, name2: ${name2}, s: ${s}, r:${r}, d:${JSON.stringify(data[name1])}`);
        // return replaceVars(r, themeName);
        // console.log('name2', name2, r);
        // return /-(famliy|family)-/.test(name2) ? r : `var(${name2})`;
        return `var(${name2})`;

    // $fontSize.3
    }).replace(/\$([\w\-\d]+)\.([\w\-\d]*)/g, function(matchStr, name1, name2, index, s) {
        let r = name2 ? data[name1][name2] : data[name1];
        log && console.log(`r2: name1: ${name1}, name2: ${name2}, s: ${s}, r:${r}, d:${JSON.stringify(data[name1])}`);
        // return replaceVars(r, themeName);
        let n = getVariableName(name1, name2);
        return `var(${n})`;

    // {--radius-normal}*2px 需计算
    }).replace(/\{(--[\w\-\d]+)\}\s*([*\/])\s*(\d+)px/g, function(matchStr, name1, name2, name3, index, s) {
        let r;
        // + - * /, 暂时只处理 * /
        if (name2 === '*') {
            r = parseInt(data[name1]) * parseInt(name3);
        }
        else {
            r = parseInt(data[name1]) / parseInt(name3);
        }
        log && console.log(`r1: name1: ${name1}, name2: ${name2}, name3: ${name3}`);
        // return r;
        return `calc(var(${name1})${name2}${name3})`;

    // eg:rgba(#ffffff,0.24)
    })/*.replace(/(rgba\(\s*)#(\w{6})/g, function(matchStr, name1, name2, index, s) {
        return `rgba(${toRGB(name2)}`;
    })*/;
    log && console.log('return:', str);
    return str;
}

function toRGBA(hex) {
    hex = String(hex);
    if(hex.startsWith('#')){
        hex = hex.substr(1);
    }
    hex = hex.replace(/^(\S)(\S)(\S)$/,'$1$1$2$2$3$3');
    let r = hex.substring(0, 2);
    let g = hex.substring(2, 4);
    let b = hex.substring(4, 6);
    let a = hex.substring(6, 8);
    let str = '';
    if (isNaN(parseInt(r, 16))) {
        console.log('parse error:', r, hex);
    }
    str = `${parseInt(r, 16)},${parseInt(g,16)},${parseInt(b,16)}`;
    if (a) {
        a = (parseInt(a, 16) / 255).toFixed(2);
        str = `${str},${a}`;
    }
    return `rgba(${str})`;
}
