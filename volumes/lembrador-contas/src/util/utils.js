function toArray(obj) {
    return Array.isArray(obj) ? obj : [].concat(obj);
}

function getCurrentPeriod() {
    let now = new Date();
    let month = now.getMonth() + 1; //months are zero based
    let year = now.getFullYear();

    if (month === 1) { //january
        month = 12;
        year = year - 1;
    } else {
        month = month -1;
    }

    return { month: month, year: year };
}

module.exports = { toArray, getCurrentPeriod };