import $ from 'webpack-zepto';
import { REDUX_ACTIONS, store } from './ReduxStore';
import { domain } from './const'

const dataApi = {
  init: (cb) => {
    chrome.storage.local.get(['tab', 'lastCleared', 'cachedCalendarDay', 'calendars'] , data => {
      const now = new Date();
      if (!data.lastCleared) {
        // init lastCleared var
        chrome.storage.local.set({lastCleared: new Date()});
      } else {
        const lastCleared = new Date(data.lastCleared);
        const daysTilSecondShabbat = (7 - lastCleared.getDay()) + 7;
        const expirationMSecs = daysTilSecondShabbat * 24 * 60 * 60 * 1000;
        if ((now.getTime() - lastCleared.getTime()) > expirationMSecs) {
          chrome.storage.local.clear();
        }
      }

      if (!data.cachedCalendarDay) {
        chrome.storage.local.set({cachedCalendarDay: (new Date()).getDay()})
      } else if (now.getDay() !== data.cachedCalendarDay) {
        chrome.storage.local.remove('calendars');
        data.calendars = null; // this datum is too old
        chrome.storage.local.set({cachedCalendarDay: now.getDay()});
      }

      cb(data);
    });

  },
  _currentRequest: null,
  _currentRequestName: null,
  _setRunningRequest: (ajax, name) => {
    dataApi._currentRequest = ajax;
    dataApi._currentRequestName = name;
  },
  abortRunningRequest: () => {
    if (!!dataApi._currentRequest) {
      console.log("aborting", dataApi._currentRequestName);
      dataApi._currentRequest.abort();
      dataApi._currentRequest = null;
      dataApi._currentRequestName = null;
    }
  },
  getCalendars: (cb) => {
    const date = (new Date()).toDateString();
    const calendarKey = 'calendars' + date;
    chrome.storage.local.get(calendarKey, data => {
      if (data[calendarKey]) {
        if (cb) { cb(data[calendarKey]); }
      } else {
        const request = $.ajax({
          url: `${domain}/api/calendars`,
          success: calendars => {
            chrome.storage.local.set({ [calendarKey]: calendars });
            if (cb) { cb(calendars); }
          },
          error: dataApi._handle_error,
        });
        dataApi._setRunningRequest(request, 'getCalendars');
      }
    });
  },
  getCalendarTextRecursive: (calObjArray, i, resultArray, cb) => {
    const realCb = (text, status, jqXHR, initScrollPos, fromCache) => {
      if (!!resultArray.text) { resultArray.text.push(text); }
      else                    { resultArray.text = [text]; }
      if (!!resultArray.status) { resultArray.status.push(status); }
      else                      { resultArray.status = [status]; }
      if (!!resultArray.jqXHR) { resultArray.jqXHR.push(jqXHR); }
      else                     { resultArray.jqXHR = [jqXHR]; }
      if (!!resultArray.fromCache) { resultArray.fromCache.push(fromCache); }
      else                         { resultArray.fromCache = [fromCache]; }

      if (i === calObjArray.length - 1 ) {
        cb(resultArray.text, resultArray.status, resultArray.jqXHR, initScrollPos, resultArray.fromCache);
      } else {
        dataApi.getCalendarTextRecursive(calObjArray, i+1, resultArray, cb);
      }
    }
    const calObj = calObjArray[i];
    const url = `${domain}/api/texts/${calObj.url}?context=0&pad=0&commentary=0`;
    const siteUrl = dataApi.api2siteUrl(url);
    chrome.storage.local.get(siteUrl, data => {
      const cached = data[siteUrl];
      if (!!cached) {
        //console.log(calendar, "from cache");
        realCb(cached.text, null, cached.jqXHR, cached.initScrollPos, true);
      } else {
        //console.log(calendar, "NOT from cache");
        const request = $.ajax({
          url,
          success: realCb,
          error: dataApi._handle_error,
        });
        dataApi._setRunningRequest(request, 'getCalendarText');
      }
    });
  },
  getCalendarText: (calendarMap, calendar, cb) => {
    const calObjArray = calendarMap[calendar];
    if (!!calObjArray) {
      dataApi.getCalendarTextRecursive(calObjArray, 0, {}, cb);
    }
  },
  getRandomSource: cb => {
    const request = $.ajax({
      url: `${domain}/api/texts/random-by-topic`,
      success: (data) => {
        const url = `${domain}/api/texts/${!!data.url ? data.url : data.ref}?context=0&pad=0&commentary=0`;
        const request = $.ajax({
          url,
          success: cb.bind(null, data.topic),
          error: dataApi._handle_error,
        });
        dataApi._setRunningRequest(request, 'random get text api');
      },
      error: dataApi._handle_error,
    });
    dataApi._setRunningRequest(request, 'random-by-topic api');
  },
  getTextForTab: tab => {
    const currTab = store.getState().tab;
    store.dispatch({ type: REDUX_ACTIONS.SET_TEXT, text: [] });
    store.dispatch({ type: REDUX_ACTIONS.SET_TITLE_URL, titleUrl: [] });
    if (tab === "Random") {
      dataApi.getRandomSource(dataApi.onRandomApi);
    } else {
      //calendars
      dataApi.getCalendarText(store.getState().calendarMap, tab, dataApi.onTextApi);
    }
  },
  mapCalendars: calendars => {
    const calendarMap = {};
    const calendarKeys = [];
    for (let c of calendars) {
      if (c.title.en in calendarMap) { calendarMap[c.title.en].push(c); }
      else {
        calendarMap[c.title.en] = [c];
        calendarKeys.push(c.title.en);
      }
    }
    return {calendarMap, calendarKeys};
  },
  onTextApi: (text, status, jqXHR, initScrollPos, fromCache) => {
    store.dispatch({ type: REDUX_ACTIONS.SET_SCROLL_POS, initScrollPos });
    store.dispatch({type: REDUX_ACTIONS.SET_TEXT, text});
    const siteUrl = jqXHR.map((tempJqXHR)=>dataApi.api2siteUrl(tempJqXHR.responseURL));
    store.dispatch({ type: REDUX_ACTIONS.SET_TITLE_URL, titleUrl: siteUrl });
    for (let i = 0; i < fromCache.length; i++) {
      const tempFromCache = fromCache[i];
      if (!tempFromCache) {
        chrome.storage.local.set({[siteUrl[i]]: { text: text[i], jqXHR: { responseURL: jqXHR[i].responseURL } }});
      }
    }
  },
  onRandomApi: (topic, text, status, jqXHR, initScrollPos, fromCache) => {
    store.dispatch({ type: REDUX_ACTIONS.SET_TOPIC, topic: topic });
    dataApi.onTextApi([text], [status], [jqXHR], initScrollPos, [fromCache]);
  },
  api2siteUrl: url => (
    //take out api and remove all url params
    url.replace('/api/texts','').replace(/\?[^/]+$/,'')
  ),
  _handle_error: (jqXHR, textStatus, errorThrown) => {
    if (textStatus == "abort") {
      console.log("abort abort!!");
      return;
    } else {
      console.log("actual error", textStatus);
    }
  },
  encodeHebrewNumeral: n => {
    // Takes an integer and returns a string encoding it as a Hebrew numeral.
    n = parseInt(n);
    if (n >= 1300) {
      return n;
    }

    var values = dataApi.hebrewNumerals;

    var heb = "";
    if (n >= 100) {
      var hundreds = n - (n % 100);
      heb += values[hundreds];
      n -= hundreds;
    }
    if (n === 15 || n === 16) {
      // Catch 15/16 no matter what the hundreds column says
      heb += values[n];
    } else {
      if (n >= 10) {
        var tens = n - (n % 10);
        heb += values[tens];
        n -= tens;
      }
      if (n > 0) {
        if (!values[n]) {
            return undefined
        }
        heb += values[n];
      }
    }

    return heb;
  },
  encodeHebrewDaf: (daf, form) => {
    // Ruturns Hebrew daf strings from "32b"
    var form = form || "short"
    var n = parseInt(daf.slice(0,-1));
    var a = daf.slice(-1);
    if (form === "short") {
      a = {a: ".", b: ":"}[a];
      return dataApi.encodeHebrewNumeral(n) + a;
    }
    else if (form === "long"){
      a = {a: 1, b: 2}[a];
      return dataApi.encodeHebrewNumeral(n) + " " + dataApi.encodeHebrewNumeral(a);
    }
  },
  hebrewNumerals: {
    "\u05D0": 1,
    "\u05D1": 2,
    "\u05D2": 3,
    "\u05D3": 4,
    "\u05D4": 5,
    "\u05D5": 6,
    "\u05D6": 7,
    "\u05D7": 8,
    "\u05D8": 9,
    "\u05D9": 10,
    "\u05D8\u05D5": 15,
    "\u05D8\u05D6": 16,
    "\u05DB": 20,
    "\u05DC": 30,
    "\u05DE": 40,
    "\u05E0": 50,
    "\u05E1": 60,
    "\u05E2": 70,
    "\u05E4": 80,
    "\u05E6": 90,
    "\u05E7": 100,
    "\u05E8": 200,
    "\u05E9": 300,
    "\u05EA": 400,
    "\u05EA\u05E7": 500,
    "\u05EA\u05E8": 600,
    "\u05EA\u05E9": 700,
    "\u05EA\u05EA": 800,
    1: "\u05D0",
    2: "\u05D1",
    3: "\u05D2",
    4: "\u05D3",
    5: "\u05D4",
    6: "\u05D5",
    7: "\u05D6",
    8: "\u05D7",
    9: "\u05D8",
    10: "\u05D9",
    15: "\u05D8\u05D5",
    16: "\u05D8\u05D6",
    20: "\u05DB",
    30: "\u05DC",
    40: "\u05DE",
    50: "\u05E0",
    60: "\u05E1",
    70: "\u05E2",
    80: "\u05E4",
    90: "\u05E6",
    100: "\u05E7",
    200: "\u05E8",
    300: "\u05E9",
    400: "\u05EA",
    500: "\u05EA\u05E7",
    600: "\u05EA\u05E8",
    700: "\u05EA\u05E9",
    800: "\u05EA\u05EA",
    900: "\u05EA\u05EA\u05E7",
    1000: "\u05EA\u05EA\u05E8",
    1100: "\u05EA\u05EA\u05E9",
    1200: "\u05EA\u05EA\u05EA"
  },
  sendSlackMessage: (text) => {
    $.ajax({
      url: "https://hooks.slack.com/services/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",
      type: "POST",
      data: JSON.stringify({ text }),
    });
  },
}

export default dataApi;
