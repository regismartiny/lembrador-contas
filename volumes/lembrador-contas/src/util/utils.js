function toArray(obj) {
    return Array.isArray(obj) ? obj : [].concat(obj);
}

export default { toArray };