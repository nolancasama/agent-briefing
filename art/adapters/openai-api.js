'use strict';

/**
 * Future official OpenAI API adapter.
 *
 * Expected interface: prepare(context, config) returns an object containing a
 * status and, once implemented, may write only the exact paths supplied in
 * context.expectedOutputs. Prompt composition, job history, reference lookup,
 * candidate validation, and review/apply behavior remain in generate.js and
 * the existing review pipeline.
 */
async function prepare() {
  throw new Error(
    'The openai-api art adapter is not implemented. Set art/config.json generator to "manual" and use npm run art:prepare.',
  );
}

module.exports = { prepare };
