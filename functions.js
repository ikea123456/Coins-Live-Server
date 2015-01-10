module.exports = {
  valueForKeyPath: function (obj, path) {
    if (obj && path)
        for (var i = 0, path = path.split('.'), len = path.length; i < len; i++) {
            if (obj[path[i]])
                obj = obj[path[i]];
            else
                return null;
        }

    return obj;
  },
  penultimate: function (array) {
    if (array && array.length > 1)
        return array[array.length - 2];
    else
        return null;
  },
  last: function (array) {
    if (array && array.length>0)
      return array[array.length-1];
    else
      return null;
  },
  parse: function (json, cb) {
    var data;

    try {
      data = JSON.parse(JSON.stringify(json)); //Does this do anything??
    }

    catch (e) {
      cb(e);
      return;
    }

    cb(null, data);
  }
};