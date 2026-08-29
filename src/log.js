'use strict'

const PREFIX = '[use-npm-skills]'

exports.info = (...args) => console.log(PREFIX, ...args)
exports.warn = (...args) => console.error(PREFIX, 'WARNING:', ...args)
exports.error = (...args) => console.error(PREFIX, 'ERROR:', ...args)
