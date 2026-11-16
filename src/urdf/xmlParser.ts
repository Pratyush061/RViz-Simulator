export interface XmlNode {
  tagName: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  text: string;
  line: number;
  column: number;
  endLine: number;
}

export interface XmlParseError {
  line: number;
  column: number;
  message: string;
}

export interface XmlParseResult {
  root: XmlNode | null;
  errors: XmlParseError[];
}

/**
 * Pure, deterministic XML parser that records exact 1-based line and column
 * numbers for every element and reports detailed syntax errors.
 * Works identically in Node.js unit tests and browser runtimes.
 */
export function parseXmlWithLines(xml: string): XmlParseResult {
  const errors: XmlParseError[] = [];
  const length = xml.length;
  let index = 0;
  let line = 1;
  let column = 1;

  function advance(count = 1) {
    for (let i = 0; i < count && index < length; i++) {
      if (xml[index] === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }
      index++;
    }
  }

  function skipWhitespace() {
    while (index < length) {
      const ch = xml[index];
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        advance(1);
      } else {
        break;
      }
    }
  }

  function decodeEntities(raw: string): string {
    return raw
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  }

  function isNameChar(ch: string): boolean {
    return /[a-zA-Z0-9_:.-]/.test(ch);
  }

  const stack: XmlNode[] = [];
  let root: XmlNode | null = null;

  while (index < length) {
    const ltIdx = xml.indexOf('<', index);
    if (ltIdx === -1) {
      // Remaining text
      const remaining = xml.slice(index).trim();
      if (remaining && stack.length > 0) {
        stack[stack.length - 1].text += decodeEntities(remaining);
      } else if (remaining && stack.length === 0) {
        errors.push({
          line,
          column,
          message: `Unexpected text outside root XML element: "${remaining.slice(0, 30)}"`,
        });
      }
      break;
    }

    // Capture text before '<'
    if (ltIdx > index) {
      const textChunk = xml.slice(index, ltIdx);
      if (stack.length > 0) {
        stack[stack.length - 1].text += decodeEntities(textChunk);
      } else if (textChunk.trim().length > 0) {
        errors.push({
          line,
          column,
          message: `Unexpected characters before XML tag: "${textChunk.trim().slice(0, 24)}"`,
        });
      }
      advance(ltIdx - index);
    }

    const tagStartLine = line;
    const tagStartCol = column;

    // Comment <!-- ... -->
    if (xml.startsWith('<!--', index)) {
      const closeComment = xml.indexOf('-->', index + 4);
      if (closeComment === -1) {
        errors.push({
          line: tagStartLine,
          column: tagStartCol,
          message: 'Unclosed XML comment (missing "-->").',
        });
        break;
      }
      advance(closeComment + 3 - index);
      continue;
    }

    // XML declaration <?xml ... ?>
    if (xml.startsWith('<?', index)) {
      const closeDecl = xml.indexOf('?>', index + 2);
      if (closeDecl === -1) {
        errors.push({
          line: tagStartLine,
          column: tagStartCol,
          message: 'Unclosed XML processing instruction (missing "?>").',
        });
        break;
      }
      advance(closeDecl + 2 - index);
      continue;
    }

    // CDATA or DOCTYPE
    if (xml.startsWith('<![CDATA[', index)) {
      const closeCdata = xml.indexOf(']]>', index + 9);
      if (closeCdata === -1) {
        errors.push({
          line: tagStartLine,
          column: tagStartCol,
          message: 'Unclosed CDATA section.',
        });
        break;
      }
      advance(closeCdata + 3 - index);
      continue;
    }

    if (xml.startsWith('<!', index)) {
      const closeDoc = xml.indexOf('>', index + 2);
      if (closeDoc === -1) {
        errors.push({
          line: tagStartLine,
          column: tagStartCol,
          message: 'Unclosed declaration tag.',
        });
        break;
      }
      advance(closeDoc + 1 - index);
      continue;
    }

    // Closing tag </tagName>
    if (xml.startsWith('</', index)) {
      advance(2);
      skipWhitespace();
      let closeName = '';
      while (index < length && isNameChar(xml[index])) {
        closeName += xml[index];
        advance(1);
      }
      skipWhitespace();
      if (index >= length || xml[index] !== '>') {
        errors.push({
          line: tagStartLine,
          column: tagStartCol,
          message: `Malformed closing tag "</${closeName}>" (missing ">").`,
        });
        break;
      }
      advance(1); // consume '>'

      if (stack.length === 0) {
        errors.push({
          line: tagStartLine,
          column: tagStartCol,
          message: `Unexpected closing tag "</${closeName}>" with no matching opening tag.`,
        });
      } else {
        const top = stack[stack.length - 1];
        if (top.tagName === closeName) {
          top.endLine = line;
          stack.pop();
        } else {
          // Check if an ancestor matches to recover gracefully
          const ancestorIdx = stack.map((n) => n.tagName).lastIndexOf(closeName);
          if (ancestorIdx !== -1) {
            for (let i = stack.length - 1; i >= ancestorIdx; i--) {
              const unclosed = stack.pop()!;
              unclosed.endLine = line;
              if (i > ancestorIdx) {
                errors.push({
                  line: unclosed.line,
                  column: unclosed.column,
                  message: `Unclosed tag "<${unclosed.tagName}>" (opened at line ${unclosed.line}, expected "</${unclosed.tagName}>" before "</${closeName}>" at line ${tagStartLine}).`,
                });
              }
            }
          } else {
            errors.push({
              line: tagStartLine,
              column: tagStartCol,
              message: `Mismatched closing tag "</${closeName}>"; expected "</${top.tagName}>" (opened at line ${top.line}).`,
            });
          }
        }
      }
      continue;
    }

    // Opening tag <tagName attr="val" ...> or <tagName ... />
    advance(1); // consume '<'
    skipWhitespace();
    let tagName = '';
    while (index < length && isNameChar(xml[index])) {
      tagName += xml[index];
      advance(1);
    }

    if (!tagName) {
      errors.push({
        line: tagStartLine,
        column: tagStartCol,
        message: 'Malformed "<" character: expected element tag name.',
      });
      advance(1);
      continue;
    }

    const attributes: Record<string, string> = {};
    let selfClosing = false;

    while (index < length) {
      skipWhitespace();
      if (index >= length) {
        errors.push({
          line: tagStartLine,
          column: tagStartCol,
          message: `Unclosed opening tag "<${tagName}>" (missing ">").`,
        });
        break;
      }

      if (xml.startsWith('/>', index)) {
        selfClosing = true;
        advance(2);
        break;
      }

      if (xml[index] === '>') {
        advance(1);
        break;
      }

      if (xml[index] === '<') {
        errors.push({
          line,
          column,
          message: `Unexpected "<" inside opening tag "<${tagName}>" (started at line ${tagStartLine}); did you forget a closing ">"?`,
        });
        break;
      }

      // Parse attribute name
      const attrLine = line;
      const attrCol = column;
      let attrName = '';
      while (index < length && isNameChar(xml[index])) {
        attrName += xml[index];
        advance(1);
      }

      if (!attrName) {
        errors.push({
          line: attrLine,
          column: attrCol,
          message: `Unexpected character "${xml[index]}" inside "<${tagName}>" tag attributes.`,
        });
        advance(1);
        continue;
      }

      skipWhitespace();
      if (index >= length || xml[index] !== '=') {
        errors.push({
          line: attrLine,
          column: attrCol,
          message: `Attribute "${attrName}" on "<${tagName}>" is missing "=" and a quoted value.`,
        });
        continue;
      }
      advance(1); // consume '='
      skipWhitespace();

      const quote = xml[index];
      if (quote !== '"' && quote !== "'") {
        errors.push({
          line,
          column,
          message: `Attribute "${attrName}" on "<${tagName}>" must have a quoted value.`,
        });
        continue;
      }
      advance(1); // consume opening quote

      const closeQuoteIdx = xml.indexOf(quote, index);
      if (closeQuoteIdx === -1) {
        errors.push({
          line: attrLine,
          column: attrCol,
          message: `Unclosed quote for attribute "${attrName}" on "<${tagName}>".`,
        });
        index = length;
        break;
      }

      const rawVal = xml.slice(index, closeQuoteIdx);
      if (rawVal.includes('<')) {
        errors.push({
          line: attrLine,
          column: attrCol,
          message: `Unescaped "<" inside attribute "${attrName}" value on "<${tagName}>" (check for a missing closing quote "${quote}").`,
        });
      }
      if (Object.prototype.hasOwnProperty.call(attributes, attrName)) {
        errors.push({
          line: attrLine,
          column: attrCol,
          message: `Duplicate attribute "${attrName}" on "<${tagName}>".`,
        });
      }
      attributes[attrName] = decodeEntities(rawVal);
      advance(closeQuoteIdx + 1 - index);
    }

    const node: XmlNode = {
      tagName,
      attributes,
      children: [],
      text: '',
      line: tagStartLine,
      column: tagStartCol,
      endLine: line,
    };

    if (stack.length > 0) {
      stack[stack.length - 1].children.push(node);
    } else {
      if (!root) {
        root = node;
      } else {
        errors.push({
          line: tagStartLine,
          column: tagStartCol,
          message: `Multiple root elements found ("<${tagName}>" at line ${tagStartLine}). A URDF document must have a single "<robot>" root element.`,
        });
      }
    }

    if (!selfClosing) {
      stack.push(node);
    }
  }

  // Any remaining unclosed elements on stack
  while (stack.length > 0) {
    const unclosed = stack.pop()!;
    errors.push({
      line: unclosed.line,
      column: unclosed.column,
      message: `Unclosed XML element "<${unclosed.tagName}>" opened at line ${unclosed.line}.`,
    });
  }

  if (!root && errors.length === 0) {
    errors.push({
      line: 1,
      column: 1,
      message: 'URDF document is empty. Expected a "<robot name=...>" root element.',
    });
  }

  return { root, errors };
}
