'use strict';
const assert = require('assert');
const { folderIdFromConfig_ } = require('../Code.js');

const ID = '1u2Awm2vtcfTwU6caQdXq2j_Ju5ohL1du';

// The URL format setupFolders now writes.
assert.strictEqual(folderIdFromConfig_('https://drive.google.com/drive/folders/' + ID), ID, 'standard /folders/ URL');
// With a sharing query string.
assert.strictEqual(folderIdFromConfig_('https://drive.google.com/drive/folders/' + ID + '?usp=sharing'), ID, 'URL with query');
// Account-scoped variant.
assert.strictEqual(folderIdFromConfig_('https://drive.google.com/drive/u/0/folders/' + ID), ID, 'u/0/folders variant');
// Legacy open?id= variant.
assert.strictEqual(folderIdFromConfig_('https://drive.google.com/open?id=' + ID), ID, 'open?id= variant');
// Backward compatibility: a bare ID (older courses) passes through unchanged.
assert.strictEqual(folderIdFromConfig_(ID), ID, 'bare ID unchanged');
// Whitespace trimmed.
assert.strictEqual(folderIdFromConfig_('  ' + ID + '  '), ID, 'trims whitespace');
// Empty / missing.
assert.strictEqual(folderIdFromConfig_(''), '', 'empty string');
assert.strictEqual(folderIdFromConfig_(undefined), '', 'undefined');
assert.strictEqual(folderIdFromConfig_(null), '', 'null');

console.log('folderIdFromConfig_: all assertions passed');
