
/* jshint globalstrict: true */
'use strict';

var ESCAPES = {'n':'\n', 'f':'\f', 'r':'\r', 't':'\t', 'v':'\v', '\'':'\'', '"':'"'};

var OPERATORS = {
  'null': _.constant(null),
  'true': _.constant(true),
  'false': _.constant(false)
};

var simpleGetterFn1 = function(key) {
  return function(scope) {
    return scope ? scope[key] : undefined;
  };
};

var simpleGetterFn2 = function(key1, key2) {
  return function(scope) {
    if (!scope) {
      return undefined;
    }
    scope = scope[key1];
    return scope ? scope[key2] : undefined;
  };
};

var generatedGetterFn = function(keys) {
  var code = '';
  _.forEach(keys, function(key) {
    code += 'if (!scope) { return undefined; }\n';
    code += 'scope = scope["' + key + '"];\n';
  });
  code += 'return scope;\n';
  /* jshint -W054 */
  return new Function('scope', code);
  /* jshint +W054 */
};

var getterFn = _.memoize(function(ident) {
  var pathKeys = ident.split('.');
  if (pathKeys.length === 1) {
    return simpleGetterFn1(pathKeys[0]);
  } else if (pathKeys.length === 2) {
    return simpleGetterFn2(pathKeys[0], pathKeys[1]);
  } else {
    return generatedGetterFn(pathKeys);
  }
});

function Lexer() {

}

Lexer.prototype.lex = function(text) {
  this.text = text;
  this.index = 0;
  this.ch = undefined;
  this.tokens = [];

  while (this.index < this.text.length) {
    this.ch = this.text.charAt(this.index);
    if (this.isNumber(this.ch) ||
          (this.ch === '.' && this.isNumber(this.peek()))) {
      this.readNumber();
    } else if (this.ch === '\'' || this.ch === '"') {
      this.readString(this.ch);
    } else if (this.isIdent(this.ch)) {
      this.readIdent(this.ch);
    } else if (this.isWhitespace(this.ch)) {
      this.index++;
    } else {
      throw 'Unexpected next character: '+this.ch;
    }
  }

  return this.tokens;
};

Lexer.prototype.isNumber = function(ch) {
  return '0' <= ch && ch <= '9';
};

Lexer.prototype.isExpOperator = function(ch) {
  return ch === '-' || ch === '+' || this.isNumber(ch);
};

Lexer.prototype.isIdent = function(ch) {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
    ch === '_' || ch === '$';
};

Lexer.prototype.isWhitespace = function(ch) {
  return (ch === ' ' || ch === '\r' || ch === '\t' ||
    ch === '\n' || ch === '\v' || ch === '\u00A0');
};

Lexer.prototype.readNumber = function() {
  var number = '';

  while (this.index < this.text.length) {
    var ch = this.text.charAt(this.index).toLowerCase();
    if (ch === '.' || this.isNumber(ch)) {
      number += ch;
    } else {
      var nextCh = this.peek();
      var prevCh = number.charAt(number.length - 1);
      if (ch === 'e' && this.isExpOperator(nextCh)) {
        number += ch;
      } else if (this.isExpOperator(ch) && prevCh === 'e' &&
                 nextCh && this.isNumber(nextCh)) {
        number += ch;
      } else if (this.isExpOperator(ch) && prevCh === 'e' &&
                 (!nextCh || !this.isNumber(nextCh))) {
        throw "Invalid exponent";
      } else {
        break;
      }
    }
    this.index++;
  }

  number = 1 * number;
  this.tokens.push({
    text: number,
    fn: _.constant(number),
    json: true
  });
};

Lexer.prototype.readString = function(quote) {
  this.index++;
  var rawString = quote;
  var string = '';
  var escape = false;
  while (this.index < this.text.length) {
    var ch = this.text.charAt(this.index);
    rawString += ch;
    if (escape) {
      if (ch === 'u') {
        var hex = this.text.substring(this.index + 1, this.index + 5);
        if (!hex.match(/[\da-f]{4}/i)) {
          throw 'Invalid unicode escape';
        }
        this.index += 4;
        string = String.fromCharCode(parseInt(hex, 16));
      } else {
        var replacement = ESCAPES[ch];
        if (replacement) {
          string += replacement;
        } else {
          string += ch;
        }
      }
      escape = false;
    } else if (ch === quote) {
      this.index++;
      this.tokens.push({
        text: rawString,
        json: true,
        fn: _.constant(string)
      });
      return;
    } else if (ch === '\\') {
      escape = true;
    } else {
      string += ch;
    }
    this.index++;
  }
  throw 'Unmatched quote';
};


Lexer.prototype.readIdent = function() {
  var text = '';
  while (this.index < this.text.length) {
    var ch = this.text.charAt(this.index);
    if (ch === '.' || this.isIdent(ch) || this.isNumber(ch)) {
      text += ch;
    } else {
      break;
    }
    this.index++;
  }

  var token = {text: text};
  if (OPERATORS.hasOwnProperty(text)) {
    token.fn = OPERATORS[text];
  } else {
    token.fn = getterFn(text);
  }

  this.tokens.push(token);
};


Lexer.prototype.peek = function() {
  return this.index < this.text.length - 1 ?
    this.text.charAt(this.index + 1) :
    false;
};



function Parser(lexer) {
  this.lexer = lexer;
}

Parser.prototype.parse = function(text) {
  this.tokens = this.lexer.lex(text);
  return this.primary();
};

Parser.prototype.primary = function() {
  var token = this.tokens[0];
  var primary = token.fn;
  if (token.json) {
    primary.constant = true;
    primary.literal = true;
  }
  return primary;
};


function parse(exp) {
  switch (typeof exp) {
    case 'string':
      var lexer = new Lexer();
      var parser = new Parser(lexer);
      return parser.parse(exp);
    case 'function':
      return exp;
    default:
      return _.noop;
  }
}
