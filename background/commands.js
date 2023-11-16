function getRecent(callback) {
  chrome.windows.getLastFocused({ populate: true }, (window) => {
    callback({ window, tabs: window.tabs })
  });
}

function cycleTabs(direction) {
  getRecent(({ tabs }) => {
    let currentTab = tabs.find((e) => e.active);
    if (!currentTab) return;

    let index = currentTab.index + direction;
    index = (index + tabs.length) % tabs.length // fix overflow
    chrome.tabs.update(tabs[index].id, { active: true });
  });
}

function onCommand(name, tab) {
  switch (name) {
    case "NEW_TAB":
      getRecent(({ window }) => {
        chrome.tabs.create({ windowId: window?.id });

        if (window && window.state === chrome.windows.WindowState.FULLSCREEN) {
          chrome.windows.update(window.id, { state: chrome.windows.WindowState.MAXIMIZED })
        }
      });
      break;

    case "CLOSE_TAB":
      if (tab && tab.id !== chrome.tabs.TAB_ID_NONE) {
        chrome.tabs.remove(tab.id);
      }
      break;

    case "RESTORE_TAB":
      chrome.sessions.restore();
      break;

    case "NEW_WINDOW":
      chrome.windows.create({ state: "maximized" });
      break;

    case "NEW_INCOG_WINDOW":
      chrome.windows.create({ state: "maximized", incognito: true });
      break;

    case "CLOSE_WINDOW":
      getRecent(({ window }) => {
        if (window.focused) {
          chrome.windows.remove(window.id);
        }
      });
      break;

    case "TAB_NEXT":
      cycleTabs(1)
      break;

    case "TAB_BACK":
      cycleTabs(-1)
      break;

    case "SWITCH_WINDOWS":
      chrome.windows.getAll((windows) => {
        if (windows.length === 1) return;
        getRecent(({ window }) => {
          chrome.windows.update(window.id, { focused: false });
        });
      })
      break;

    case "CTRL_1":
    case "CTRL_2":
    case "CTRL_3":
    case "CTRL_4":
    case "CTRL_5":
    case "CTRL_6":
    case "CTRL_7":
    case "CTRL_8":
      let num = Number(name.split("_")[1]);
      getRecent(({ tabs }) => {
        let specifiedTab = tabs[num - 1];
        if (!specifiedTab) return;

        chrome.tabs.update(specifiedTab.id, { active: true });
      });
      break;

    case "CTRL_9":
      getRecent(({ tabs }) => {
        let lastTab = tabs[tabs.length - 1];
        chrome.tabs.update(lastTab.id, { active: true });
      });
      break;
  }
}

chrome.commands.onCommand.addListener(onCommand);
chrome.runtime.onMessage.addListener(async function (msg, sender, sendResponse) {
  if (msg.type === "loadinspectargets") {
    await chrome.debugger.attach({ targetId: "browser" }, '1.3');
    var allTargets = await chrome.debugger.sendCommand({ targetId: 'browser' }, 'Target.getTargets');
    await chrome.debugger.detach({ targetId: 'browser' });
    sendResponse({
      data: allTargets.targetInfos,
      type: 'response'
    });
  }
  if (msg.type === "startinspect") {
    await chrome.debugger.attach({ targetId: 'browser' }, '1.3')
    function chromeTabsScriptFull() {
      var url = URL.createObjectURL(new Blob(["<script>alert(1)</script>"], { type: 'text/html' }));
      chrome.tabs.create({ url: url });
    }
    var id = setInterval(async () => {

      (await chrome.debugger.sendCommand({ targetId: 'browser' }, "Target.getTargets")).targetInfos.forEach(async function (t) {
        console.log(t.type);
        if (t.url.includes('chrome-extension://' + msg.extid) && t.type === "service_worker") {
          var targetId = t.targetId;
          var { sessionId } = await chrome.debugger.sendCommand({ targetId: 'browser' }, 'Target.attachToTarget', { targetId, flatten: false })
          console.log(await chrome.debugger.sendCommand({ targetId: "browser" }, 'Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id: 999, method: "Runtime.evaluate", params: { expression: `(${chromeTabsScriptFull.toString()})()` } }) }));
          chrome.debugger.detach({ targetId: 'browser' })
          sendResponse({
            "error": null,
            "data": ""
          })
          clearInterval(id)
        }
      })

    }, 200);



  }
  if (msg.type === "cancelinspect") {
    await chrome.debugger.detach({ targetId: 'browser' });
    sendResponse({ error: null, type: 'response', data: {} });
  }
})