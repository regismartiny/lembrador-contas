function toArray(obj) {
    return Array.isArray(obj) ? obj : [].concat(obj);
}

module.exports = { toArray };