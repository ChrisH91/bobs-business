var _       = require('underscore');
var request = require('request');

/**
 * Requester.js
 *
 * A utility service that allows you to chain together HTTP requests, keeping
 * the session alive by persisting cookies.
 *
 * This class will mimick the Chrome 'User-Agent' header and some other little
 * things to make it look more like a real browser.
 *
 * Requests may be chained and are run synchronously in the order they are added
 * to the request queue. No requests will run until you exec().
 *
 * Example:
 *
 * var rq = new Requester();
 * rq.get('http://google.com')
 *   .post('http://google.com/account', {
 *      username: 'username@gmail.com',
 *      password: 'password'
 *    }, 'loginReq', {
 *      headers: {
 *        'X-My-Header': 'Auth'
 *      }
 *    })
 *    .exec(function (err)) {
 *      console.log(rq.responses.loginReq);
 *    });
 *
 * This makes 2 requests, in the following order:
 *
 *   GET http://google.com
 *   POST http://google.com/account
 *
 * The POST request will not be made until the get request finishes successfully
 * and rq.responses.loginReq will contain the node http response object for the
 * second request.
 */
var Requester = function (cookies) {

  /**
   * User agent string that will be sent with *all* HTTP requests made by the
   * requester. This mimics Google Chrome.
   *
   * @type {string}
   */
  var userAgentString = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2272.76 Safari/537.36';

  /**
   * Flag which indicates whether or not the requester is currently in the
   * process of executing HTTP requests.
   *
   * This will be false before exec() is called and will be false again after
   * the last HTTP request finishes or an error occurs
   *
   * @type {boolean}
   */
  var executing = false;

  /**
   * Flag which indicates whether the requests have completed successfully.
   *
   * @type {boolean}
   */
  var complete = false;

  /**
   * Our queue of requests to be executed. Stored in order.
   *
   * A request in this context is a function which can be called to execute a
   * HTTP request, the function takes 1 argument which should be a callback
   * function.
   *
   * @type {[function]}
   */
  var requestQueue = [];

  /**
   * A hashmap of responses from previous requests made.
   *
   * The response will only be stored if it is a named request. A named request
   * is one which has a name passed in when it is created. The name passed in
   * will be the key
   *
   * @type {object}
   */
  var responseBucket = {};

  /**
   * A tough-cookie, cookie jar. Used for storing cookies across requests
   *
   * @type {CookieJar}
   */
  var cookies = cookies ? cookies : request.jar();



  /**
   * Very basic implementation of an execCallback. This function simply updates
   * the state of of this object to indicate that there are no more requets in
   * the queue or some request in the request queue failed.
   *
   * This callback will always be called whenever a request chain finishes, as
   * well as any user defined callbacks
   *
   * @type {function}
   */
  var baseCallback = function () {
    executing = false;
    complete  = true;
  };

  /**
   * Holds the function that will be called when the request queue has finished
   * executing and all requests return a non-error HTTP status.
   *
   * If the user passes in a new callback function to th exec() function then
   * this base callback will be replaced with.
   *
   * function (cb) {
   *   baseCallback();
   *   cb();
   * }
   *
   * @type {function}
   */
  var execCallback = baseCallback;

  /**
   * Perform a HTTP GET request.
   *
   * @param {string} uri
   *        The URL to perform the GET against
   *
   * @param {string?} name
   *        Optional. An identifier that can be used to retrieve the response
   *        from this HTTP request
   *
   * @param {object} options
   *        Optional. An object containing additional HTTP paramaters. In the
   *        format:
   *
   *        {
   *          headers: {
   *            'X-Header': 'MyHeader'
   *          }
   *        }
   *
   *        'headers' is the only key supported at the present time.
   *
   * @return {object}
   *         this
   */
  var get = function (uri, name, options) {

    var headers = getHeaders(options);

    var nextRequest = function (cb) {
      request({
        method:         'GET',
        uri:            uri,
        jar:            cookies,
        headers:        headers
      }, function (err, response, body) {
        if (typeof name === 'string') {
          responseBucket[name] = response;
        }

        cb(err);
      });
    };

    requestQueue.push(nextRequest);

    return this;
  };

  /**
   * Perform a HTTP POST request.
   *
   * @param {string} uri
   *        The URL to perform the POST against
   *
   * @param {string?} name
   *        Optional. An identifier that can be used to retrieve the response
   *        from this HTTP request
   *
   * @param {object} options
   *        Optional. An object containing additional HTTP paramaters. In the
   *        format:
   *
   *        {
   *          headers: {
   *            'X-Header': 'MyHeader'
   *          }
   *        }
   *
   *        'headers' is the only key supported at the present time.
   *
   * @return {object}
   *         this
   */
  var post = function (uri, data, name, options) {

    var headers = getHeaders(options);

    // Add an additional header for the post data
    headers['Content-Type'] = 'application/x-www-form-urlencoded';

    var nextRequest = function (cb) {
      request({
        method: 'POST',
        uri: uri,
        jar: cookies,
        headers: headers,
        form: data
      }, function (err, response, body) {
        if (typeof name === 'string') {
          responseBucket[name] = response;
        }

        cb(err);
      });
    };

    requestQueue.push(nextRequest);

    return this;
  }

  /**
   * Helper function for setting the headers in a pending request.
   *
   * This helper method takes an options object as would be passed into one of
   * the HTTP methods. And creates a headers object which can be passed into
   * request()
   *
   * @param {object} options
   *        The options object passed in by the user
   *
   * @return {object}
   *         An object containing headers that can be passed into request()
   */
  var getHeaders = function (options) {
    var headers = {};

    if (typeof options !== 'undefined') {
      if (typeof options.headers !== 'undefined') {
        headers = options.headers;
      }
    }

    headers['User-Agent'] = userAgentString;

    return headers;
  }

  /**
   * Manually set a cookie that will be sent with all requests.
   *
   * This is a wrapper around tough-cookie's setCookie function. The cookie
   * parameter must be of the raw cookie string format.
   *
   * Example:
   *
   * rq.setCookie('MyCookie=Cookie', 'http://hostname.com')
   *
   * @param {string} cookie
   *        The cookie string
   *
   * @param {string} hostname
   *        The hostname to attach this cookie to
   *
   * @param {object} options
   *        options object passed directly into tough-cookie
   *
   * @return {object}
   *         this
   */
  var setCookie = function (cookie, hostname, options) {
    var nextFunction = function (cb) {
      cookies.setCookie(cookie, hostname, options);
      cb(null);
    }

    requestQueue.push(nextFunction);

    return this;
  }

  /**
   * Recursively go through all the requests in the queue and execute them.
   *
   * This function will iterate through the list of request object and make
   * execute them in the order that they should be.
   *
   * The requests in this object will not be executed until the previous request
   * has finished and returned succesfully
   *
   * @param {number} nextIndex
   *        The numerical index of the next request to be executed
   */
  var recursiveExec = function (nextIndex) {
    if (typeof nextIndex === 'undefined') {
      nextIndex = 0;
    }

    var nextFunction = requestQueue[nextIndex];

    if (typeof nextFunction === 'undefined') {
      execCallback(null);
      return;
    }

    nextFunction(function (err) {
      if (err !== null) {
        execCallback(err);
        return;
      }

      recursiveExec(nextIndex + 1);
    });
  }

  /**
   * Gogogogo.
   *
   * Start working through the request queue in the order that request were
   * added to the queue, executing the callback passed in once all requests are
   * complete.
   *
   * @param {function} cb
   *        Callback to call when we're finished executing
   */
  var exec = function (cb) {
    executing = true;
    complete  = false;

    if (typeof cb === 'function') {
      execCallback = function (err) {
        executing = false;
        complete  = true;
        cb(err);
      }
    }

    recursiveExec();
  }

  // Build out the public facing API.

  this.responses = responseBucket;

  this.get  = get;
  this.post = post;
  this.exec = exec;

  this.isExecuting = function () { return executing; };
  this.isComplete  = function () { return complete;  };
  this.setCookie   = setCookie;
  this.getCookies = () => { return cookies; }
};

module.exports = Requester;