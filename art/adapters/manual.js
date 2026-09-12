'use strict';

const fs = require('node:fs/promises');

/**
 * Manual delivery adapter.
 *
 * The generator owns prompt composition, filenames, references, and state. This
 * adapter deliberately does only the delivery-specific work: create the target
 * directory and leave it empty for PNGs saved by the user.
 */
async function prepare({ outputDirectory }) {
  await fs.mkdir(outputDirectory, { recursive: true });
  return { status: 'prepared' };
}

module.exports = { prepare };
