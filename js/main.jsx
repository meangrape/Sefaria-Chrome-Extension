//zip -r chrome.zip Sefaria-Chrome-Extension -x '*node_modules*'
//zip -r -FS ../firefox.zip * -x '*node_modules*' 'js/*' '\.DS_Store'

import React from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import { REDUX_ACTIONS, store } from './ReduxStore';
import TextManager from './TextManager';
import dataApi from './dataApi';

//Initialize App
//chrome.storage.local.clear(()=>{ console.log("cleared"); });
dataApi.init((data) => {
  if (!!data.calendars && !dataApi.DISABLE_CACHE) {
    store.dispatch({ type: REDUX_ACTIONS.SET_CALENDARS, ...dataApi.mapCalendars(data.calendars) });
  }

  const initTab = data.tab || "Random";
  const initLanguage = data.language || 'bi';
  store.dispatch({type: REDUX_ACTIONS.SET_TAB, tab: initTab});
  store.dispatch({type: REDUX_ACTIONS.SET_LANGUAGE, language: initLanguage});
  dataApi.getCalendars((data) => {
    store.dispatch({ type: REDUX_ACTIONS.SET_CALENDARS, ...dataApi.mapCalendars(data) });
    dataApi.getTextForTab(initTab);
  });
});
ReactDOM.render(
  <Provider store={store}>
    <TextManager />
  </Provider>,
  document.getElementById("root")
);
