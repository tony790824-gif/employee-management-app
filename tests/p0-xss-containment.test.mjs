import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const authenticatedScripts = [
  'dom-safety.js', 'app.js', 'access.js', 'employee-work.js', 'boss-hours.js',
  'management-actions.js', 'enhancements.js', 'employee-layout.js'
];

for (const file of authenticatedScripts) {
  const source = await readFile(file, 'utf8');
  assert.doesNotMatch(source, /\.(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(/,
    `${file} 不得把資料交給 HTML 解析器`);
  assert.doesNotMatch(source, /<[^>]+\son[a-z]+\s*=/i,
    `${file} 不得建立行內事件處理器`);
}

class TextNode {
  constructor(value) { this.nodeType = 3; this.textContent = String(value); }
}
class Element {
  constructor(tagName) {
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.textContent = '';
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
}

const context = {
  window: {},
  document: {
    createElement: tagName => new Element(tagName),
    createTextNode: value => new TextNode(value)
  }
};
vm.createContext(context);
vm.runInContext(await readFile('dom-safety.js', 'utf8'), context);

const attack = '<img src=x onerror="globalThis.pwned=true">';
const node = context.window.shiftDomSafety.element('p', { text: attack, title: attack });
assert.equal(node.textContent, attack, '攻擊字串必須保留成純文字');
assert.equal(node.title, attack, 'title 必須經 DOM 屬性處理，不可拼入 HTML');
assert.equal(node.children.length, 0, '純文字內容不得產生可執行子節點');

const select = new Element('select');
context.window.shiftDomSafety.replace(select, context.window.shiftDomSafety.option('id-1', attack));
assert.equal(select.children[0].textContent, attack, '下拉選單標籤必須維持純文字');
assert.equal(select.children[0].children.length, 0, '選項文字不得解析為 HTML');

const login = await readFile('login.js', 'utf8');
assert.ok(login.indexOf("'dom-safety.js'") < login.indexOf("'app.js'"), '安全 DOM 模組必須先於應用程式載入');

console.log('P0 stored XSS containment tests passed.');
