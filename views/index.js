'use strict'
const ws = new WebSocket('ws://localhost:8080');

var clientState = {
    artnet: {
        hosts: "127.0.0.1",
        subnet: 0,
        net: 0,
        universe: 0
    },
    settings: {
        frameLength: 512,
        frameView: 0,
        playback: 'stopped'
    },
    frameNumber: 0
}

var serverState = {}

var inputThrottleTimer = null;

//====================================================================================

ws.onopen = function () {
    console.log('WebSocket connection established');
    ws.binaryType = "arraybuffer";
    document.getElementById("main-servererror").style.display = 'none';
};

ws.onclose = function () {
    document.getElementById("main-servererror").style.removeProperty('display');
}

ws.onmessage = function (event) {
    let jsonMsg = JSON.parse(event.data);

    if (jsonMsg.action != 'framedata') console.log('Message from server: ', jsonMsg);

    switch (jsonMsg.action) {
        default:
            try {
                JSON.parse(event.utf8Data);
            }
            catch (e) {
                console.error("Message was not JSON - Error");
                break;
            }
            console.error("Invalid JSON command");
            break;
        case 'framedata':
            clientState.frameNumber = jsonMsg.frameNumber;
            serverState.artnet = jsonMsg.artnet;
            uxUpdateFramePreview(Uint8Array.from(jsonMsg.data));
            break;
        case 'start':
        case 'state':
            serverState = jsonMsg.state;
            if (clientState.frameNumber > serverState.record.line) clientState.frameNumber = serverState.record.line;
            break;
        // case 'framenumber':
        //     document.getElementById("main-edit-framesel").value = jsonMsg.value;
        //     break;
    }
}

//====================================================================================

document.getElementById("main-deletebefore").addEventListener('click', function () {
    console.log("Delete All Frames Before");
    ws.send(JSON.stringify({ action: 'deleteframes', frameEnd: Number(document.getElementById("main-edit-framesel").value), frameStart: null, deleteMode: "before" }));
});

document.getElementById("main-deleteafter").addEventListener('click', function () {
    console.log("Delete All Frames After");
    ws.send(JSON.stringify({ action: 'deleteframes', frameEnd: null, frameStart: Number(document.getElementById("main-edit-framesel").value), deleteMode: "after" }));
});

document.getElementById("main-controls-start").addEventListener('click', function () {
    console.log("Start");
    ws.send(JSON.stringify({ action: 'start', state: clientState, format:document.getElementById("main-format").value }));
    this.disabled = true;
});

document.getElementById("main-controls-stop").addEventListener('click', function () {
    console.log("Stop");
    ws.send(JSON.stringify({ action: 'stop' }));
    document.getElementById("main-controls-start").disabled = false;
});

document.getElementById("main-controls-length").addEventListener('input', function () {
    console.log("Length: ", Number(this.value));

    if (this.value > 512) this.value = 512;
    if (this.value <= 0) this.value = 1;
    clientState.settings.frameLength = Number(this.value);
});

document.getElementById("main-controls-lengthupdate").addEventListener('click', function () {
    console.log("Update Length: ", Number(document.getElementById("main-controls-length").value));
    ws.send(JSON.stringify({ action: 'state', state: clientState }));
    uxRenderFramePreview();
});

document.getElementById("main-controls-playback").addEventListener('click', function () {
    console.log("Playback");
    if (clientState.settings.playback == 'stopped') {
        clientState.settings.playback = 'running';
        this.innerText = "Play Back Stop";
        document.getElementById("main-controls-start").disabled = true;
        document.getElementById("main-controls-stop").disabled = true;
        this.classList.add("active");
    }
    else {
        this.innerText = "Play Back Start";
        clientState.settings.playback = 'stopped';
        document.getElementById("main-controls-start").disabled = false;
        document.getElementById("main-controls-stop").disabled = false;
        this.classList.remove("active");
    }

    ws.send(JSON.stringify({ action: 'playback', state: clientState }));
});

document.getElementById("main-edit-framesel").addEventListener('input', function () {
    if (eventThrottle(25)) return;
    // console.log("Frame Select");
    ws.send(JSON.stringify({ action: 'getframe', value: Number(this.value) }));
    document.getElementById("main-edit-frameselnum").innerText = this.value;
});

document.getElementById("main-edit-framesel").addEventListener('mouseup', function () {
    // console.log("Frame Select");
    ws.send(JSON.stringify({ action: 'getframe', value: Number(this.value) }));
    document.getElementById("main-edit-frameselnum").innerText = this.value;
});

//====================================================================================

function eventThrottle(time = 25) {
    if (inputThrottleTimer == null) {
        inputThrottleTimer = setTimeout(function () {
            clearTimeout(inputThrottleTimer);
            inputThrottleTimer = null;
        }, time);
        return false;
    }
    else return true;
}

//====================================================================================

setInterval(function () {
    try {
        if (serverState.record.enabled) document.getElementById("status-filesize").innerText = ((clientState.frameNumber * clientState.settings.frameLength) / 1024).toFixed(2) + "KB";
        else document.getElementById("status-filesize").innerText = "";

        document.getElementById("status-artnet").innerText = (serverState.artnet.fps > 0) ? serverState.artnet.fps + " FPS" : "stopped";//serverState.artnet.active;

        if (serverState.record.enabled) document.getElementById("status-framenumber").innerText = clientState.frameNumber;
        else document.getElementById("status-framenumber").innerText = clientState.frameNumber + " of " + (serverState.record.line);

        document.getElementById("status-filepath").innerText = serverState.record.path;
        document.getElementById("status-recording").innerText = serverState.record.enabled;
        document.getElementById("main-edit-framesel").max = serverState.record.line;
        document.getElementById("status-packetsz").innerText = serverState.artnet.packetSz;
    }
    catch (e) { console.log("error", e); }
}, 200);

//====================================================================================
function uxRenderFramePreview() {
    console.log("uxRenderFramePreview()");
    let cont = document.getElementById("main-preview");
    cont.innerHTML = "";
    let template = "";
    for (let i = 0; i < clientState.settings.frameLength; i++) {
        template += `<div>${(i + 1)}</div>`
    } //end for
    cont.innerHTML = template;
}
uxRenderFramePreview();

//====================================================================================

function uxUpdateFramePreview(data) {
    // console.log("uxUpdateFramePreview()");
    let cont = document.getElementById("main-preview");
    let divs = cont.children;
    let dataIndex = 0;
    for (const elem of divs) {
        // elem.style.backgroundColor = rgbToHex(data[dataIndex++],data[dataIndex++],data[dataIndex++]);
        elem.style.backgroundColor = '#' + decimalToHex(data[dataIndex]) + decimalToHex(data[dataIndex]) + decimalToHex(data[dataIndex]); //greyscale
        dataIndex++;
    }
}

//====================================================================================
function decimalToHex(decimal) {
    // Ensure the decimal value is within the valid range
    decimal = Math.max(0, Math.min(255, decimal));

    // Convert to hex and pad with zeros if necessary
    return decimal.toString(16).padStart(2, '0').toUpperCase();
}

//====================================================================================
function rgbToHex(r, g, b) {
    return "#" + decimalToHex(r) + decimalToHex(g) + decimalToHex(b);
}

//====================================================================================