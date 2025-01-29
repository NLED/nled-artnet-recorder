NLED ArtNet Recorder

A simple application for recording one ArtNet universe and writing the data to a file. The created files can be loaded into external software such as NLED Aurora Magician or other applications that support the file formats. The currently supported file formats are a custom binary(.bin) file for use with NLED software and devices, but is quite simple and could be ported for use on other platforms. The user interface allows the settings and configurations to be setup. It offers the ability to crop the recorded ArtNet data by removing data frames from the beginning or the end. That makes it much easier to capture only the data required.

Utilizes NodeJS, websockets, and a front-end browser webpage for user interfacing. When the NodeJS script is launched it automatically starts a webserver and launches the user interface in the default browser.

This project is offered as a stand-alone executable, no additional installations are required.

Use Cases:
Record DMX files and upload them to an addressable LED pixel controller such as the NLED Pixel Controller Proton for low-cost, small form factor DMX playback capabilities. https://www.nledshop.com/pixelproton/


Build node-pkg executable: pkg nled-artnet-recorder.js -o nled-artnet-recorder-v1-0-0 -t node18 -c ./package.json

Libraries Utilized:
https://github.com/margau/dmxnet
https://github.com/vercel/pkg
https://expressjs.com/
https://github.com/websockets/ws

Tested on NodeJS v23.4.0 and Google Chrome Version 131


Written by Jeff Nygaard of NLED - MIT License - https://www.NLEDshop.com



TODO:
    Support multiple ArtNet universes
    Add more file formats
    Improve user interface
    