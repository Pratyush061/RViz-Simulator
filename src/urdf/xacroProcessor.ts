import { CompilerDiagnostic } from './types';
import { XmlNode } from './xmlParser';

export interface XacroMacroDef {
  name: string;
  paramOrder: string[];
  paramDefaults: Record<string, string>;
  blockParams: Set<string>;
  bodyNodes: XmlNode[];
  line: number;
}

export interface XacroScope {
  properties: Record<string, string | number>;
  blockProperties: Record<string, XmlNode[]>;
  args: Record<string, string>;
  macros: Record<string, XacroMacroDef>;
}

export interface XacroExpansionResult {
  rootNode: XmlNode;
  expandedXml: string;
  isXacro: boolean;
  diagnostics: CompilerDiagnostic[];
  propertyCount: number;
  macroCount: number;
}

const VALID_XACRO_NAMESPACE_URIS = new Set([
  'http://www.ros.org/wiki/xacro',
  'http://ros.org/wiki/xacro',
  'https://www.ros.org/wiki/xacro',
  'https://ros.org/wiki/xacro',
]);

/**
 * Safe recursive-descent mathematical & boolean expression evaluator for ROS2 Xacro `${...}`.
 * Supports arithmetic (+, -, *, /, %, **), comparisons (==, !=, <, <=, >, >=),
 * boolean logic (and, or, not, &&, ||, !), parentheses, variables, and math functions.
 */
class SafeXacroExpressionEvaluator {
  private pos = 0;
  private input = '';
  private vars: Record<string, string | number>;

  constructor(expr: string, vars: Record<string, string | number>) {
    this.input = expr.trim();
    this.vars = vars;
  }

  public evaluate(): string | number {
    this.pos = 0;
    if (!this.input) {
      throw new Error('Empty Xacro expression "${}"');
    }

    // Check if it's a direct single variable lookup that holds a string (like ${prefix} or ${lr_xyz})
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(this.input)) {
      if (Object.prototype.hasOwnProperty.call(this.vars, this.input)) {
        return this.vars[this.input];
      }
      if (this.input === 'pi' || this.input === 'PI') return Math.PI;
      if (this.input === 'e' || this.input === 'E') return Math.E;
      if (this.input === 'true' || this.input === 'True') return 1;
      if (this.input === 'false' || this.input === 'False') return 0;
    }

    const val = this.parseOr();
    this.skipWhitespace();
    if (this.pos < this.input.length) {
      throw new Error(
        `Unexpected token at "${this.input.slice(this.pos)}" in expression "${this.input}"`,
      );
    }
    return val;
  }

  private skipWhitespace() {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++;
    }
  }

  private matchKeyword(kw: string): boolean {
    this.skipWhitespace();
    if (this.input.startsWith(kw, this.pos)) {
      const nextChar = this.input[this.pos + kw.length];
      if (!nextChar || !/[a-zA-Z0-9_]/.test(nextChar)) {
        this.pos += kw.length;
        return true;
      }
    }
    return false;
  }

  private matchOp(op: string): boolean {
    this.skipWhitespace();
    if (this.input.startsWith(op, this.pos)) {
      this.pos += op.length;
      return true;
    }
    return false;
  }

  private parseOr(): string | number {
    let left = this.parseAnd();
    while (true) {
      if (this.matchOp('||') || this.matchKeyword('or')) {
        const right = this.parseAnd();
        left = this.toBool(left) || this.toBool(right) ? 1 : 0;
      } else {
        break;
      }
    }
    return left;
  }

  private parseAnd(): string | number {
    let left = this.parseComparison();
    while (true) {
      if (this.matchOp('&&') || this.matchKeyword('and')) {
        const right = this.parseComparison();
        left = this.toBool(left) && this.toBool(right) ? 1 : 0;
      } else {
        break;
      }
    }
    return left;
  }

  private parseComparison(): string | number {
    let left = this.parseAdditive();
    while (true) {
      if (this.matchOp('==')) {
        const right = this.parseAdditive();
        left = left == right ? 1 : 0;
      } else if (this.matchOp('!=')) {
        const right = this.parseAdditive();
        left = left != right ? 1 : 0;
      } else if (this.matchOp('<=')) {
        const right = this.parseAdditive();
        left = Number(left) <= Number(right) ? 1 : 0;
      } else if (this.matchOp('>=')) {
        const right = this.parseAdditive();
        left = Number(left) >= Number(right) ? 1 : 0;
      } else if (this.matchOp('<')) {
        const right = this.parseAdditive();
        left = Number(left) < Number(right) ? 1 : 0;
      } else if (this.matchOp('>')) {
        const right = this.parseAdditive();
        left = Number(left) > Number(right) ? 1 : 0;
      } else {
        break;
      }
    }
    return left;
  }

  private parseAdditive(): string | number {
    let left = this.parseMultiplicative();
    while (true) {
      if (this.matchOp('+')) {
        const right = this.parseMultiplicative();
        if (typeof left === 'string' || typeof right === 'string') {
          const lNum = Number(left);
          const rNum = Number(right);
          if (
            !Number.isNaN(lNum) &&
            !Number.isNaN(rNum) &&
            String(left).trim() !== '' &&
            String(right).trim() !== ''
          ) {
            left = lNum + rNum;
          } else {
            left = String(left) + String(right);
          }
        } else {
          left = left + right;
        }
      } else if (this.matchOp('-')) {
        const right = this.parseMultiplicative();
        const lNum = Number(left);
        const rNum = Number(right);
        if (Number.isNaN(lNum) || Number.isNaN(rNum)) {
          throw new Error(
            `Cannot subtract non-numeric values "${left}" and "${right}"`,
          );
        }
        left = lNum - rNum;
      } else {
        break;
      }
    }
    return left;
  }

  private parseMultiplicative(): string | number {
    let left = this.parsePower();
    while (true) {
      this.skipWhitespace();
      if (this.input.startsWith('**', this.pos)) {
        break;
      }
      if (this.matchOp('*')) {
        const right = this.parsePower();
        const lNum = Number(left);
        const rNum = Number(right);
        if (Number.isNaN(lNum) || Number.isNaN(rNum)) {
          throw new Error(
            `Cannot multiply non-numeric values "${left}" and "${right}"`,
          );
        }
        left = lNum * rNum;
      } else if (this.matchOp('/')) {
        const right = Number(this.parsePower());
        if (right === 0) {
          throw new Error(`Division by zero in "${this.input}"`);
        }
        left = Number(left) / right;
      } else if (this.matchOp('%')) {
        const right = Number(this.parsePower());
        if (right === 0) {
          throw new Error(`Modulo by zero in "${this.input}"`);
        }
        left = Number(left) % right;
      } else {
        break;
      }
    }
    return left;
  }

  private parsePower(): string | number {
    const base = this.parseUnary();
    if (this.matchOp('**')) {
      const exp = this.parsePower();
      return Math.pow(Number(base), Number(exp));
    }
    return base;
  }

  private parseUnary(): string | number {
    if (this.matchOp('+')) {
      return +Number(this.parseUnary());
    }
    if (this.matchOp('-')) {
      return -Number(this.parseUnary());
    }
    if (this.matchOp('!') || this.matchKeyword('not')) {
      return this.toBool(this.parseUnary()) ? 0 : 1;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): string | number {
    this.skipWhitespace();

    // Parenthesized sub-expression
    if (this.matchOp('(')) {
      const val = this.parseOr();
      if (!this.matchOp(')')) {
        throw new Error(`Missing closing parenthesis in "${this.input}"`);
      }
      return val;
    }

    // String literal '...' or "..."
    const ch = this.input[this.pos];
    if (ch === "'" || ch === '"') {
      const quote = ch;
      this.pos++;
      let str = '';
      while (this.pos < this.input.length && this.input[this.pos] !== quote) {
        str += this.input[this.pos++];
      }
      if (this.pos >= this.input.length) {
        throw new Error(`Unclosed string literal in "${this.input}"`);
      }
      this.pos++;
      return str;
    }

    // Numeric literal
    const numMatch = this.input
      .slice(this.pos)
      .match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
    if (numMatch) {
      this.pos += numMatch[0].length;
      return parseFloat(numMatch[0]);
    }

    // Identifier or math function call
    const idMatch = this.input
      .slice(this.pos)
      .match(/^[a-zA-Z_][a-zA-Z0-9_.]*/);
    if (idMatch) {
      const ident = idMatch[0];
      this.pos += ident.length;
      this.skipWhitespace();

      // Function call: sin(x), cos(x), atan2(y, x), pow(x, y), radians(d), degrees(r)
      if (this.matchOp('(')) {
        const args: number[] = [];
        this.skipWhitespace();
        if (!this.matchOp(')')) {
          while (true) {
            args.push(Number(this.parseOr()));
            if (this.matchOp(',')) continue;
            if (this.matchOp(')')) break;
            throw new Error(
              `Expected ',' or ')' in function call "${ident}"`,
            );
          }
        }
        const fn = ident.replace(/^math\./, '');
        switch (fn) {
          case 'sin':
            return Math.sin(args[0] ?? 0);
          case 'cos':
            return Math.cos(args[0] ?? 0);
          case 'tan':
            return Math.tan(args[0] ?? 0);
          case 'asin':
            return Math.asin(args[0] ?? 0);
          case 'acos':
            return Math.acos(args[0] ?? 0);
          case 'atan':
            return Math.atan(args[0] ?? 0);
          case 'atan2':
            return Math.atan2(args[0] ?? 0, args[1] ?? 1);
          case 'sqrt':
            if ((args[0] ?? 0) < 0) {
              throw new Error(`sqrt() of negative number ${args[0]}`);
            }
            return Math.sqrt(args[0] ?? 0);
          case 'abs':
          case 'fabs':
            return Math.abs(args[0] ?? 0);
          case 'floor':
            return Math.floor(args[0] ?? 0);
          case 'ceil':
            return Math.ceil(args[0] ?? 0);
          case 'round':
            return Math.round(args[0] ?? 0);
          case 'pow':
            return Math.pow(args[0] ?? 0, args[1] ?? 1);
          case 'min':
            return Math.min(...args);
          case 'max':
            return Math.max(...args);
          case 'radians':
            return ((args[0] ?? 0) * Math.PI) / 180;
          case 'degrees':
            return ((args[0] ?? 0) * 180) / Math.PI;
          default:
            throw new Error(`Unknown Xacro function "${ident}()"`);
        }
      }

      // Built-in constants
      if (ident === 'pi' || ident === 'PI' || ident === 'math.pi') {
        return Math.PI;
      }
      if (ident === 'e' || ident === 'E' || ident === 'math.e') {
        return Math.E;
      }
      if (ident === 'deg2rad') return Math.PI / 180;
      if (ident === 'rad2deg') return 180 / Math.PI;
      if (ident === 'true' || ident === 'True') return 1;
      if (ident === 'false' || ident === 'False') return 0;

      if (Object.prototype.hasOwnProperty.call(this.vars, ident)) {
        const val = this.vars[ident];
        const asNum = Number(val);
        if (
          typeof val === 'string' &&
          val.trim() !== '' &&
          !Number.isNaN(asNum) &&
          !/\s/.test(val.trim())
        ) {
          return asNum;
        }
        return val;
      }

      throw new Error(`Undefined Xacro property "${ident}"`);
    }

    throw new Error(
      `Cannot parse Xacro expression "${this.input}" at "${this.input.slice(this.pos)}"`,
    );
  }

  private toBool(val: string | number): boolean {
    if (typeof val === 'number') return val !== 0 && !Number.isNaN(val);
    const s = val.trim().toLowerCase();
    return s !== '' && s !== '0' && s !== 'false';
  }
}

function formatEvaluatedValue(val: string | number): string {
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return '0';
    const rounded = Number(val.toFixed(8));
    return String(rounded);
  }
  return String(val);
}

/**
 * Evaluates all `${...}` and `$(arg ...)` placeholders inside a string attribute or text node.
 */
export function evaluateXacroString(
  raw: string,
  scope: XacroScope,
  line: number,
  diagnostics: CompilerDiagnostic[],
): string {
  if (!raw || !raw.includes('$')) {
    return raw;
  }

  // Protect escaped $${...}
  const ESCAPED_TOKEN = '__XACRO_ESCAPED_DOLLAR__';
  let result = raw.replace(/\$\$\{/g, `${ESCAPED_TOKEN}{`);

  // Check for unclosed ${ or $(
  const openBraceCount = (result.match(/\$\{/g) || []).length;
  if (openBraceCount > 0) {
    let idx = 0;
    while ((idx = result.indexOf('${', idx)) !== -1) {
      const closeIdx = result.indexOf('}', idx + 2);
      if (closeIdx === -1) {
        diagnostics.push({
          id: `xacro-unclosed-expr-${line}-${idx}`,
          severity: 'error',
          line,
          message: `Unclosed Xacro expression in "${raw}" (missing closing "}")`,
        });
        break;
      }
      idx = closeIdx + 1;
    }
  }

  const openParenSubCount = (result.match(/\$\(/g) || []).length;
  if (openParenSubCount > 0) {
    let idx = 0;
    while ((idx = result.indexOf('$(', idx)) !== -1) {
      const closeIdx = result.indexOf(')', idx + 2);
      if (closeIdx === -1) {
        diagnostics.push({
          id: `xacro-unclosed-sub-${line}-${idx}`,
          severity: 'error',
          line,
          message: `Unclosed Xacro substitution in "${raw}" (missing closing ")")`,
        });
        break;
      }
      idx = closeIdx + 1;
    }
  }

  // 1. Handle $(...) substitutions
  result = result.replace(/\$\(([^)]*)\)/g, (_, inner: string) => {
    const trimmed = inner.trim();
    const parts = trimmed.split(/\s+/);
    const cmd = parts[0];
    const argName = parts[1];
    if (cmd === 'arg') {
      if (!argName) {
        diagnostics.push({
          id: `xacro-empty-arg-${line}`,
          severity: 'error',
          line,
          message: `Malformed $(arg) substitution in "${raw}": missing argument name.`,
        });
        return '';
      }
      if (Object.prototype.hasOwnProperty.call(scope.args, argName)) {
        return scope.args[argName];
      }
      diagnostics.push({
        id: `xacro-undef-arg-${line}-${argName}`,
        severity: 'error',
        line,
        message: `Undefined Xacro argument "$(arg ${argName})"; declare it first with <xacro:arg name="${argName}" default="..."/>.`,
      });
      return '';
    }
    if (cmd === 'find' || cmd === 'find-pkg-share') {
      if (!argName) {
        diagnostics.push({
          id: `xacro-empty-find-${line}`,
          severity: 'error',
          line,
          message: `Malformed $(${cmd}) substitution: missing package name.`,
        });
        return '';
      }
      return `package://${argName}`;
    }
    diagnostics.push({
      id: `xacro-unknown-sub-${line}-${cmd}`,
      severity: 'error',
      line,
      message: `Unknown Xacro substitution "$(${trimmed})"; expected $(arg <name>) or $(find <pkg>).`,
    });
    return '';
  });

  // 2. Evaluate ${...} expressions (including empty ${})
  result = result.replace(/\$\{([^}]*)\}/g, (_, exprStr: string) => {
    try {
      const evaluator = new SafeXacroExpressionEvaluator(
        exprStr,
        scope.properties,
      );
      const evaluated = evaluator.evaluate();
      return formatEvaluatedValue(evaluated);
    } catch (err) {
      diagnostics.push({
        id: `xacro-expr-err-${line}-${diagnostics.length}`,
        severity: 'error',
        line,
        message: `Xacro expression error in "\${${exprStr}}": ${(err as Error).message}`,
      });
      return '0';
    }
  });

  // Normalize accidental "--0.2" if someone wrote "-${neg_val}"
  result = result.replace(/(^|\s)--(\d)/g, '$1$2');

  return result.replace(new RegExp(ESCAPED_TOKEN, 'g'), '$');
}

function parseMacroParamsSpec(paramsAttr: string): {
  paramOrder: string[];
  paramDefaults: Record<string, string>;
  blockParams: Set<string>;
} {
  const paramOrder: string[] = [];
  const paramDefaults: Record<string, string> = {};
  const blockParams = new Set<string>();

  const regex =
    /(\*?[a-zA-Z0-9_:-]+)(?::=\s*('[^']*'|"[^"]*"|\S+))?/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(paramsAttr)) !== null) {
    let rawName = m[1];
    const rawDefault = m[2];
    if (rawName.startsWith('*')) {
      rawName = rawName.slice(1);
      blockParams.add(rawName);
    }
    paramOrder.push(rawName);
    if (rawDefault !== undefined) {
      paramDefaults[rawName] = rawDefault.replace(/^['"]|['"]$/g, '');
    }
  }

  return { paramOrder, paramDefaults, blockParams };
}

const ALLOWED_XACRO_PROPERTY_ATTRS = new Set([
  'name',
  'value',
  'default',
  'scope',
  'lazy_eval',
  'remove',
]);
const ALLOWED_XACRO_MACRO_ATTRS = new Set(['name', 'params']);
const ALLOWED_XACRO_ARG_ATTRS = new Set(['name', 'default']);
const ALLOWED_XACRO_COND_ATTRS = new Set(['value']);
const ALLOWED_XACRO_INSERT_BLOCK_ATTRS = new Set(['name']);

function cloneAndExpandNodes(
  nodes: XmlNode[],
  scope: XacroScope,
  diagnostics: CompilerDiagnostic[],
  depth = 0,
): XmlNode[] {
  if (depth > 24) {
    diagnostics.push({
      id: `xacro-max-depth-${diagnostics.length}`,
      severity: 'error',
      line: nodes[0]?.line ?? 1,
      message: 'Maximum Xacro macro recursion depth (24) exceeded.',
    });
    return [];
  }

  const output: XmlNode[] = [];

  for (const node of nodes) {
    const tag = node.tagName;

    // 1. <xacro:property name="..." value="..." />
    if (tag === 'xacro:property') {
      for (const attrKey of Object.keys(node.attributes)) {
        if (!ALLOWED_XACRO_PROPERTY_ATTRS.has(attrKey)) {
          diagnostics.push({
            id: `xacro-prop-bad-attr-${node.line}-${attrKey}`,
            severity: 'error',
            line: node.line,
            message: `Invalid attribute "${attrKey}" on <xacro:property> at line ${node.line}. Allowed attributes: name, value, default, scope.`,
          });
        }
      }

      const propName = node.attributes.name?.trim();
      if (!propName) {
        diagnostics.push({
          id: `xacro-prop-noname-${node.line}`,
          severity: 'error',
          line: node.line,
          message: '<xacro:property> is missing required "name" attribute.',
        });
        continue;
      }

      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(propName)) {
        diagnostics.push({
          id: `xacro-prop-badname-${node.line}-${propName}`,
          severity: 'error',
          line: node.line,
          message: `Invalid Xacro property name "${propName}"; must be a valid identifier.`,
        });
      }

      const rawValueAttr =
        node.attributes.value !== undefined
          ? node.attributes.value
          : node.attributes.default;

      if (rawValueAttr !== undefined) {
        const evalStr = evaluateXacroString(
          rawValueAttr,
          scope,
          node.line,
          diagnostics,
        );
        const asNum = Number(evalStr);
        scope.properties[propName] =
          evalStr.trim() !== '' &&
          !Number.isNaN(asNum) &&
          !/\s/.test(evalStr.trim())
            ? asNum
            : evalStr;
      } else if (node.children.length > 0) {
        scope.blockProperties[propName] = node.children;
      } else {
        diagnostics.push({
          id: `xacro-prop-novalue-${node.line}-${propName}`,
          severity: 'error',
          line: node.line,
          message: `<xacro:property name="${propName}"> at line ${node.line} is missing a value="..." attribute or child XML block.`,
        });
      }
      continue;
    }

    // 2. <xacro:arg name="..." default="..." />
    if (tag === 'xacro:arg') {
      for (const attrKey of Object.keys(node.attributes)) {
        if (!ALLOWED_XACRO_ARG_ATTRS.has(attrKey)) {
          diagnostics.push({
            id: `xacro-arg-bad-attr-${node.line}-${attrKey}`,
            severity: 'error',
            line: node.line,
            message: `Invalid attribute "${attrKey}" on <xacro:arg>. Allowed attributes: name, default.`,
          });
        }
      }
      const argName = node.attributes.name?.trim();
      if (!argName) {
        diagnostics.push({
          id: `xacro-arg-noname-${node.line}`,
          severity: 'error',
          line: node.line,
          message: '<xacro:arg> is missing required "name" attribute.',
        });
        continue;
      }
      if (scope.args[argName] === undefined) {
        scope.args[argName] = evaluateXacroString(
          node.attributes.default ?? '',
          scope,
          node.line,
          diagnostics,
        );
      }
      continue;
    }

    // 3. <xacro:macro name="..." params="...">
    if (tag === 'xacro:macro') {
      for (const attrKey of Object.keys(node.attributes)) {
        if (!ALLOWED_XACRO_MACRO_ATTRS.has(attrKey)) {
          diagnostics.push({
            id: `xacro-macro-bad-attr-${node.line}-${attrKey}`,
            severity: 'error',
            line: node.line,
            message: `Invalid attribute "${attrKey}" on <xacro:macro> at line ${node.line}. Allowed attributes: name, params.`,
          });
        }
      }
      const macroName = node.attributes.name?.trim();
      if (!macroName) {
        diagnostics.push({
          id: `xacro-macro-noname-${node.line}`,
          severity: 'error',
          line: node.line,
          message: '<xacro:macro> is missing required "name" attribute.',
        });
        continue;
      }
      if (node.children.length === 0) {
        diagnostics.push({
          id: `xacro-macro-empty-${node.line}-${macroName}`,
          severity: 'warning',
          line: node.line,
          message: `<xacro:macro name="${macroName}"> at line ${node.line} has an empty body.`,
        });
      }
      const { paramOrder, paramDefaults, blockParams } = parseMacroParamsSpec(
        node.attributes.params ?? '',
      );
      scope.macros[macroName] = {
        name: macroName,
        paramOrder,
        paramDefaults,
        blockParams,
        bodyNodes: node.children,
        line: node.line,
      };
      continue;
    }

    // 4. <xacro:if value="..."> / <xacro:unless value="...">
    if (tag === 'xacro:if' || tag === 'xacro:unless') {
      for (const attrKey of Object.keys(node.attributes)) {
        if (!ALLOWED_XACRO_COND_ATTRS.has(attrKey)) {
          diagnostics.push({
            id: `xacro-cond-bad-attr-${node.line}-${attrKey}`,
            severity: 'error',
            line: node.line,
            message: `Invalid attribute "${attrKey}" on <${tag}>; expected value="...".`,
          });
        }
      }
      if (node.attributes.value === undefined) {
        diagnostics.push({
          id: `xacro-cond-noval-${node.line}`,
          severity: 'error',
          line: node.line,
          message: `<${tag}> at line ${node.line} is missing required value="..." attribute.`,
        });
        continue;
      }
      const rawCond = node.attributes.value;
      const evalCond = evaluateXacroString(
        rawCond,
        scope,
        node.line,
        diagnostics,
      )
        .trim()
        .toLowerCase();
      const isTruthy =
        evalCond !== '' &&
        evalCond !== '0' &&
        evalCond !== '0.0' &&
        evalCond !== 'false';
      const shouldInclude = tag === 'xacro:if' ? isTruthy : !isTruthy;
      if (shouldInclude) {
        output.push(
          ...cloneAndExpandNodes(node.children, scope, diagnostics, depth + 1),
        );
      }
      continue;
    }

    // 5. <xacro:insert_block name="..." />
    if (tag === 'xacro:insert_block') {
      for (const attrKey of Object.keys(node.attributes)) {
        if (!ALLOWED_XACRO_INSERT_BLOCK_ATTRS.has(attrKey)) {
          diagnostics.push({
            id: `xacro-block-bad-attr-${node.line}-${attrKey}`,
            severity: 'error',
            line: node.line,
            message: `Invalid attribute "${attrKey}" on <xacro:insert_block>; expected name="...".`,
          });
        }
      }
      const blockName = node.attributes.name?.trim();
      if (blockName && scope.blockProperties[blockName]) {
        output.push(
          ...cloneAndExpandNodes(
            scope.blockProperties[blockName],
            scope,
            diagnostics,
            depth + 1,
          ),
        );
      } else {
        diagnostics.push({
          id: `xacro-missing-block-${node.line}`,
          severity: 'error',
          line: node.line,
          message: `<xacro:insert_block name="${blockName ?? ''}"/> references an undefined block.`,
        });
      }
      continue;
    }

    // 6. <xacro:include ... />
    if (tag === 'xacro:include') {
      if (!node.attributes.filename) {
        diagnostics.push({
          id: `xacro-include-nofile-${node.line}`,
          severity: 'error',
          line: node.line,
          message: '<xacro:include> is missing required filename="..." attribute.',
        });
      }
      continue;
    }

    // 7. Macro Invocation: <xacro:macro_name ...> or <macro_name ...> if defined in scope.macros
    const strippedName = tag.startsWith('xacro:') ? tag.slice(6) : tag;
    const macroDef =
      scope.macros[strippedName] ||
      (tag.startsWith('xacro:') ? scope.macros[tag] : undefined);

    if (macroDef) {
      const localScope: XacroScope = {
        properties: { ...scope.properties },
        blockProperties: { ...scope.blockProperties },
        args: { ...scope.args },
        macros: { ...scope.macros },
      };

      const allowedValueParams = new Set(
        macroDef.paramOrder.filter((p) => !macroDef.blockParams.has(p)),
      );

      // Check for unknown parameters passed to macro call
      for (const attrKey of Object.keys(node.attributes)) {
        if (!allowedValueParams.has(attrKey)) {
          diagnostics.push({
            id: `xacro-call-unknown-param-${node.line}-${attrKey}`,
            severity: 'error',
            line: node.line,
            message: `Macro "<${tag}>" at line ${node.line} does not accept parameter "${attrKey}". Expected params: [${Array.from(allowedValueParams).join(', ')}].`,
          });
        }
      }

      // Check that all required non-default parameters were provided
      for (const pName of macroDef.paramOrder) {
        if (macroDef.blockParams.has(pName)) continue;
        const hasDefault =
          Object.prototype.hasOwnProperty.call(macroDef.paramDefaults, pName);
        const wasPassed =
          Object.prototype.hasOwnProperty.call(node.attributes, pName);
        if (!hasDefault && !wasPassed) {
          diagnostics.push({
            id: `xacro-call-missing-param-${node.line}-${pName}`,
            severity: 'error',
            line: node.line,
            message: `Macro call "<${tag}>" at line ${node.line} is missing required parameter "${pName}".`,
          });
        }
      }

      // Populate defaults first
      for (const pName of macroDef.paramOrder) {
        if (macroDef.paramDefaults[pName] !== undefined) {
          const defVal = evaluateXacroString(
            macroDef.paramDefaults[pName],
            localScope,
            node.line,
            diagnostics,
          );
          const asNum = Number(defVal);
          localScope.properties[pName] =
            defVal.trim() !== '' &&
            !Number.isNaN(asNum) &&
            !/\s/.test(defVal.trim())
              ? asNum
              : defVal;
        }
      }

      // Bind attribute parameters passed at call site
      for (const [attrKey, attrVal] of Object.entries(node.attributes)) {
        const evalVal = evaluateXacroString(
          attrVal,
          scope,
          node.line,
          diagnostics,
        );
        const asNum = Number(evalVal);
        localScope.properties[attrKey] =
          evalVal.trim() !== '' &&
          !Number.isNaN(asNum) &&
          !/\s/.test(evalVal.trim())
            ? asNum
            : evalVal;
      }

      // Bind positional block parameters (*block) from node.children
      const blockParamList = macroDef.paramOrder.filter((p) =>
        macroDef.blockParams.has(p),
      );
      if (node.children.length < blockParamList.length) {
        diagnostics.push({
          id: `xacro-call-missing-block-${node.line}`,
          severity: 'error',
          line: node.line,
          message: `Macro call "<${tag}>" expects ${blockParamList.length} child XML block(s) for [*${blockParamList.join(', *')}], but found ${node.children.length}.`,
        });
      }
      blockParamList.forEach((bName, idx) => {
        const childBlock = node.children[idx];
        localScope.blockProperties[bName] = childBlock ? [childBlock] : [];
      });

      const expandedChildren = cloneAndExpandNodes(
        macroDef.bodyNodes,
        localScope,
        diagnostics,
        depth + 1,
      );

      for (const expNode of expandedChildren) {
        output.push(expNode);
      }
      continue;
    }

    // Catch unknown <xacro:...> tags or unbound namespace prefixes
    if (tag.startsWith('xacro:')) {
      diagnostics.push({
        id: `xacro-unknown-tag-${node.line}-${tag}`,
        severity: 'error',
        line: node.line,
        message: `Unknown Xacro macro or directive "<${tag}>" at line ${node.line}.`,
      });
      continue;
    }

    if (tag.includes(':')) {
      const prefix = tag.split(':')[0];
      diagnostics.push({
        id: `xml-unknown-prefix-${node.line}-${tag}`,
        severity: 'error',
        line: node.line,
        message: `Unknown XML namespace prefix "${prefix}:" on "<${tag}>" at line ${node.line}; expected "xacro:".`,
      });
      continue;
    }

    // 8. Standard URDF XML Element: evaluate ${...} inside all attributes and expand children
    const evaluatedAttrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(node.attributes)) {
      if (k === 'xmlns:xacro') continue;
      evaluatedAttrs[k] = evaluateXacroString(v, scope, node.line, diagnostics);
    }

    const expandedChildNodes = cloneAndExpandNodes(
      node.children,
      scope,
      diagnostics,
      depth,
    );

    output.push({
      tagName: node.tagName,
      attributes: evaluatedAttrs,
      children: expandedChildNodes,
      text: evaluateXacroString(node.text, scope, node.line, diagnostics),
      line: node.line,
      column: node.column,
      endLine: node.endLine,
    });
  }

  return output;
}

/**
 * Serializes an expanded XmlNode tree into clean, formatted `.urdf` XML string.
 */
export function serializeXmlNodeToUrdf(node: XmlNode, indent = 0): string {
  const pad = '  '.repeat(indent);
  const attrPairs = Object.entries(node.attributes)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
  const attrStr = attrPairs ? ` ${attrPairs}` : '';

  if (node.children.length === 0 && !node.text) {
    return `${pad}<${node.tagName}${attrStr}/>`;
  }

  if (node.children.length === 0 && node.text) {
    return `${pad}<${node.tagName}${attrStr}>${node.text}</${node.tagName}>`;
  }

  const childrenStr = node.children
    .map((c) => serializeXmlNodeToUrdf(c, indent + 1))
    .join('\n');
  return `${pad}<${node.tagName}${attrStr}>\n${childrenStr}\n${pad}</${node.tagName}>`;
}

function hasAnyXacroElementsRecursive(node: XmlNode): boolean {
  if (node.tagName.startsWith('xacro:')) return true;
  return node.children.some((c) => hasAnyXacroElementsRecursive(c));
}

/**
 * Detects if a root XML node or source string uses ROS2 Xacro features
 * (`xmlns:xacro`, `<xacro:...`, or `${...}`) and expands it into pure URDF AST + XML.
 */
export function expandXacroAst(
  rootNode: XmlNode,
  rawXmlSource: string,
): XacroExpansionResult {
  const diagnostics: CompilerDiagnostic[] = [];
  const hasXacroTags = hasAnyXacroElementsRecursive(rootNode);
  const hasDollarExpressions =
    rawXmlSource.includes('${') || rawXmlSource.includes('$(');
  const declaredXacroUri = rootNode.attributes['xmlns:xacro'];

  // Check for misspelled xmlns:* attributes on <robot>
  for (const [attrKey, attrVal] of Object.entries(rootNode.attributes)) {
    if (attrKey.startsWith('xmlns') && attrKey !== 'xmlns:xacro') {
      diagnostics.push({
        id: `xacro-bad-xmlns-attr-${rootNode.line}-${attrKey}`,
        severity: 'error',
        line: rootNode.line,
        message: `Invalid XML namespace attribute ${attrKey}="${attrVal}" on <robot>. Expected xmlns:xacro="http://www.ros.org/wiki/xacro".`,
      });
    }
  }

  // Validate xmlns:xacro URI value if present (catches typos like http://www.ros.rg/wiki/xacro)
  if (declaredXacroUri !== undefined) {
    const trimmedUri = declaredXacroUri.trim();
    if (!VALID_XACRO_NAMESPACE_URIS.has(trimmedUri)) {
      diagnostics.push({
        id: `xacro-invalid-uri-${rootNode.line}`,
        severity: 'error',
        line: rootNode.line,
        message: `Invalid Xacro namespace URI xmlns:xacro="${declaredXacroUri}". Expected official ROS 2 Xacro URI "http://www.ros.org/wiki/xacro".`,
      });
    }
  } else if (hasXacroTags) {
    // Using <xacro:...> tags without declaring xmlns:xacro on <robot>
    diagnostics.push({
      id: `xacro-missing-xmlns-${rootNode.line}`,
      severity: 'error',
      line: rootNode.line,
      message: `Unbound namespace prefix "xacro:": <robot> at line ${rootNode.line} is missing xmlns:xacro="http://www.ros.org/wiki/xacro".`,
    });
  }

  const isXacro =
    declaredXacroUri !== undefined || hasXacroTags || hasDollarExpressions;

  const scope: XacroScope = {
    properties: {},
    blockProperties: {},
    args: {},
    macros: {},
  };

  const expandedRootList = cloneAndExpandNodes(
    [rootNode],
    scope,
    diagnostics,
    0,
  );
  const finalRoot = expandedRootList[0] ?? rootNode;
  const expandedXml = `<?xml version="1.0"?>\n${serializeXmlNodeToUrdf(finalRoot, 0)}\n`;

  return {
    rootNode: finalRoot,
    expandedXml,
    isXacro,
    diagnostics,
    propertyCount: Object.keys(scope.properties).length,
    macroCount: Object.keys(scope.macros).length,
  };
}
