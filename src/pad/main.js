import * as PIXI from 'pixi.js';
import { sound } from '@pixi/sound';
import { FWApplication } from '../fwnetwork/fwapplication.js';
import { FWTouchControl } from '../fwnetwork/fwtouchcontrol.js';
import { FWNetwork } from '../fwnetwork/fwnetwork.js';
import { FWNetworkGamepad, FWFixedSizeByteArray } from '../fwnetwork/fwnetworkgamepad.js';
import { initDialog, setUrlParam, getQueryParam } from '../fwnetwork/qr.js';

const CONNECTION_STATUS_OFF = 0
const CONNECTION_STATUS_INITIALIZNG = 1
const CONNECTION_STATUS_WORKING = 2
const CONNECTION_STATUS_ERROR = 3

const version = '2.0.0';

var touchControl = null;
var gamepad = new FWNetworkGamepad();
var prevGamepadState = null;
var prevGamepadStateMustSent = null
const maxMessagesPerSecond = 20;
const minDelay = 50;
var messageCount = 0;
var currentSecond = Math.floor(Date.now() / 1000);
var lastSentTime = 0;

function getPixelPerCentimeter() {
    const pxPerCm = document.getElementById('1cm').offsetWidth
    return pxPerCm
}

function centimeterToPixel(cm) {
    return cm * getPixelPerCentimeter()
}

async function init() {

    const app = new FWApplication();
    await app.init({
        title: 'F-Mote',
        version: version,
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        resizeTo: window
    });

    app.setLoading(0.0, 'Loading');
    touchControl = new FWTouchControl(app);
    app.touchControl = touchControl;
    app.containerGame.addChild(touchControl);

    app.serverPrefix = 'hidden'
    app.serverId = getQueryParam('id') || '';
    const rawColorParam = getQueryParam('color') || 'pff0000';
    const colorParam = /^[pg]/.test(rawColorParam) ? rawColorParam : 'p' + rawColorParam;
    app.colorCode = colorParam;
    try { app.color = new PIXI.Color(colorParam.slice(1)); } catch(e) { app.color = new PIXI.Color('ff0000'); }

    initDialog(app);
    const savedBtn = document.querySelector(`#colors [data-color="${colorParam}"]`);
    if (savedBtn?.dataset.bg) {
        document.documentElement.style.setProperty('--pad-bg-image', savedBtn.dataset.bg);
    }
    app.layout = 'loading';
    app.mode = getQueryParam('mode') || 'default';
    app.connectionStatus = CONNECTION_STATUS_OFF;

    const network = FWNetwork.getInstance();

    app.connectionStatus = CONNECTION_STATUS_INITIALIZNG;
    app.padConfigOverride = null;

    network.onJsonMessage = (msg) => {
        if (msg.type === 'padConfig') {
            app.padConfigOverride = msg;
            if (msg.layout) {
                app.layout = msg.layout;
                setUrlParam('layout', msg.layout);
            }
            if (msg.color) {
                try {
                    app.color = new PIXI.Color(msg.color.slice(1));
                    app.colorCode = msg.color;
                    document.documentElement.style.setProperty('--pad-color', app.color.toHex());
                    setUrlParam('color', msg.color);
                } catch(e) {}
            }
        }
    };

    if (app.serverId && app.serverId !== '') {
        network.connectToRoom(app.serverPrefix + app.serverId);
        network.peer.on('error', (err) => {
            console.error('Connection error:', err);
        });
    } else if (app.mode !== 'dev') {
        app.settingsDialog.show();
    }


    sound.add('padButton', { url: './assets/sfx/button.ogg', preload: true });

    app.finishLoading();

    app.ticker.add((ticker) => {
        app.isPortrait = app.screen.width < app.screen.height;
        app.ticker = ticker;

        if (app.isPortrait) {
            app.containerGame.angle = -270 - ticker.lastTime * 0.0;
            app.containerGame.x = app.screen.width;
            app.containerGame.screenWidth = app.screen.height;
            app.containerGame.screenHeight = app.screen.width;
        } else {
            app.containerGame.angle = 0;
            app.containerGame.x = 0;
            app.containerGame.scale.set(1, 1);
            app.containerGame.screenWidth = app.screen.width;
            app.containerGame.screenHeight = app.screen.height;
        }

        main(app);
    });
}

window.addEventListener("load", (event) => {
    init();
});

function main(app) {
    let networkStatus = FWNetwork.getInstance().getStatus()

    switch (networkStatus) {
        case 'connected':
            app.connectionStatus = CONNECTION_STATUS_WORKING
            break;
        case 'disconnected':
            app.connectionStatus = CONNECTION_STATUS_OFF
            break;
        case 'connecting':
            app.connectionStatus = CONNECTION_STATUS_INITIALIZNG
            break;
        case 'error':
            app.connectionStatus = CONNECTION_STATUS_ERROR
            break;
        case 'open':
            app.connectionStatus = CONNECTION_STATUS_INITIALIZNG
            break;
        case 'hosting':
            app.connectionStatus = CONNECTION_STATUS_WORKING
            break;
    }


    touchControl.update(app);
    touchControl.updateGamepad(gamepad);

    const currentState = FWNetwork.getInstance().getGamepadData(gamepad);
    const currentStateMustSent = FWNetwork.getInstance().getJSONGamepadsButtonsOnlyState(gamepad);
    const now = Date.now();
    const second = Math.floor(now / 1000);

    if (second > currentSecond) {
        currentSecond = second;
        messageCount = 0;
    }

    if ((currentStateMustSent !== currentStateMustSent) ||
        (!FWFixedSizeByteArray.areUint8ArraysEqual(prevGamepadState, currentState) &&
        messageCount < maxMessagesPerSecond &&
        now - lastSentTime >= minDelay)
        ) {
        if (app.connectionStatus === CONNECTION_STATUS_WORKING) {
            const network = FWNetwork.getInstance();
            network.sendGamepadData(currentState);
            messageCount++;
            lastSentTime = now;
            prevGamepadState = currentState;
            prevGamepadStateMustSent = currentStateMustSent
        }
    }
}
