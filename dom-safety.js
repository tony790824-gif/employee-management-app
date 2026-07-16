(() => {
  const asText = value => String(value ?? '');

  function element(tagName, options = {}, children = []) {
    const node = document.createElement(tagName);
    if (options.className) node.className = options.className;
    const has = name => Object.prototype.hasOwnProperty.call(options, name);
    if (has('text')) node.textContent = asText(options.text);
    if (has('value')) node.value = asText(options.value);
    if (has('title')) node.title = asText(options.title);
    if (has('colSpan')) node.colSpan = Number(options.colSpan);
    if (options.dataset) {
      Object.entries(options.dataset).forEach(([key, value]) => { node.dataset[key] = asText(value); });
    }
    if (options.attributes) {
      Object.entries(options.attributes).forEach(([name, value]) => node.setAttribute(name, asText(value)));
    }
    for (const child of children) node.append(child?.nodeType ? child : document.createTextNode(asText(child)));
    return node;
  }

  const option = (value, label) => element('option', { value, text: label });
  const cell = (value, options = {}) => element('td', options, [value]);
  const emptyRow = (columns, message) => element('tr', {}, [cell(message, { className: 'empty', colSpan: columns })]);
  const replace = (target, ...children) => target.replaceChildren(...children.filter(Boolean));

  window.shiftDomSafety = Object.freeze({ element, option, cell, emptyRow, replace });
})();
