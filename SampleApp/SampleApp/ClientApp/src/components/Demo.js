import React, { Component } from 'react';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import CloudApi from '../helpers/CloudApi';
import CheckImage from '../assets/check.png';
import AlertImage from '../assets/alert.png';

export class Demo extends Component {
    static displayName = Demo.name;
    static numberOfEvents = 2;

    constructor(props) {
        super(props);
        this.api = new CloudApi();
        this.api.init();

        this.state = {
            livePipeline: { edgePipeline: null, cloudPipeline: null },
            livePipelines: [],
            loading: true,
            loadingLivePipelines: true,
            videoName: "",
            livePipelineName: "",
            connection: null,
            alertFired: { fired: false, timestamp: null, inference: null },
            appSettings: {},
            deviceId: "",
            loading: true,
            events: {},
            videoReady: false
        };

        this.token = null;
        this.changeStateLivePipeline = this.changeStateLivePipelineOperation.bind(this);
    }

    async componentDidMount() {
        await this.getConfig();
        await this.getLivePipelines();
        await this.initConnection();
    }

    async getConfig() {
        const settings = await this.api.getConfig();
        this.setState({ appSettings: settings });
    }

    async initConnection() {
        const connection = new HubConnectionBuilder()
            .withUrl("/eventhub")
            .configureLogging(LogLevel.Error)
            .build();

        connection.on("ReceivedNewEvent", (eventData, pipelineName) => {
            // eventData follows the inference schema:
            //https://docs.microsoft.com/en-us/azure/azure-video-analyzer/video-analyzer-docs/inference-metadata-schema

            console.log('Added event');
            const { events } = this.state;

            let updatedEvents = { ...events };

            if (events[pipelineName] === undefined) {
                let newEvent = { [pipelineName]: [] };
                updatedEvents = { ...updatedEvents, ...newEvent };
            }

            updatedEvents[pipelineName].push(eventData);

            this.setState({ events: updatedEvents });

            if (updatedEvents[pipelineName].length > Demo.numberOfEvents) {
                this.stopToEvent(pipelineName)
                    .then(() => this.setState({ alertFired: { fired: true, timestamp: new Date(), inference: JSON.parse(updatedEvents[pipelineName][Demo.numberOfEvents]) } })
                );
            }
        });

        connection.on("InitVideo", (livePipelineName) => {
            console.log('Init video');
            try {
                // Activate Cloud LivePipeline
                this.api.changeStateLivePipeline(livePipelineName, 'activate')
                    .catch(err => {
                        throw err;
                    })
            }
            catch (e) {
                alert(`Error initializing video: ${e}`);
            }
        });

        connection.start();
        this.setState({ connection: connection });
    }

    async changeStateLivePipelineOperation(livePipeline, state) {
        const action = state === "Inactive" ? "Activate" : "Deactivate";
        const url = `/VideoAnalyzer/LivePipeline${action}?livePipelineName=${livePipeline}`;
        const { events } = this.state;

        try {
            const response = await fetch(url, {
                method: 'POST'
            });

            if (response.ok) {
                if (action === "Activate") {
                    this.setState({ activeLivePipeline: livePipeline }, async () => {
                        await this.listenToEvent(livePipeline);
                    });
                }
                else {
                    await this.stopToEvent(livePipeline);
                    await this.api.changeStateLivePipeline(livePipeline, 'deactivate')
                    this.deleteVideoPlayer(livePipeline);

                    // Clear events
                    let updatedEvents = { ...events };

                    if (updatedEvents[livePipeline] !== undefined) {
                        let newEvent = { [livePipeline]: [] };
                        updatedEvents = { ...updatedEvents, ...newEvent };
                    }

                    this.setState({ activeLivePipeline: "", events: updatedEvents, alertFired: { fired: false, timestamp: null, inference: null } });
                }
            }
            else {
                alert("Operation failed, please check the console log.");
                console.log(await response.text());
            }
        }
        catch (e) {
            console.log(e);
        }
        finally {
            await this.getLivePipelines();
        }
    }

    async getLivePipelines() {
        const url = '/VideoAnalyzer/LivePipelineList';
        try {
            const response = await fetch(url, {
                method: 'GET'
            });

            let activePipeline = null;
            let activeCloudPipeline = null;

            if (response.ok) {
                const jsonResponse = await response.json();
                const data = JSON.parse(jsonResponse);

                // set the first active live pipeline
                activePipeline = data[0];
                const cloudLivePipelines = await this.api.getLivePipelines();
                activeCloudPipeline = cloudLivePipelines.find(x => x.name === activePipeline.name);
            }
            else {
                console.log(response.statusText);
            }

            this.setState({ livePipeline: { edgePipeline: activePipeline, cloudPipeline: activeCloudPipeline } }, async () => {
                if (activePipeline != null && activePipeline.properties.state.toLowerCase() === "active") {
                    await this.listenToEvent(activeCloudPipeline.name);
                }
            });
        }
        catch (e) {
            console.log(e);
        }
        finally {
            this.setState({ loadingLivePipelines: false });
        }
    }

    async getVideoPlayback(pipelineName) {
        try {
            const { livePipeline } = this.state;

            if (livePipeline.cloudPipeline !== null) {
                const videoName = livePipeline.cloudPipeline.properties.parameters.find(x => x.name === "videoNameParameter").value;
                let response = await this.api.getVideoPlayback(videoName);
                if (response.tunneledRtspUrl !== undefined) {
                    this.renderVideoPlayer(response.tunneledRtspUrl, response.playbackToken, pipelineName);
                }
            }
        }
        catch (e) {
            alert("Video is not available yet, please try it again.");
        }
    }

    async listenToEvent(livePipelineName) {
        const url = `/VideoAnalyzer/ListenToEvents?livePipelineName=${livePipelineName}`;
        try {
            const response = await fetch(url, {
                method: 'GET'
            });

            if (!response.ok) {
                const errorMessageObj = await response.json();
                throw new Error(`Cannot listen to events: ${errorMessageObj.error.message}`);
            }
        }
        catch (e) {
            alert(e);
        }
    }

    async stopToEvent(pipelineName) {
        const url = `/VideoAnalyzer/StopListeningToEvents?livePipelineName=${pipelineName}`;
        try {
            const response = await fetch(url, {
                method: 'GET'
            });

            if (!response.ok) {
                const errorMessageObj = await response.json();
                throw new Error(`Cannot stop listening to events: ${errorMessageObj.error.message}`);
            }
        }
        catch (e) {
            alert(e);
        }
    }

    deleteVideoPlayer(pipelineName) {
        let videoRootContainer = document.getElementById("videoRootContainer" + pipelineName);
        while (videoRootContainer.firstChild) {
            videoRootContainer.firstChild.remove();
        }
        this.setState({ videoReady: false });
    }

    renderVideoPlayer(wsHost, websocketToken, pipelineName) {
        let videoId = 0;

        const container = document.getElementById("videoRootContainer" + pipelineName);
        if (container !== undefined && container.childElementCount > 0) {
            return;
        }

        // Dynamically create and add instances of lva-rtsp-player based on input fields. A dummy value for rtspUri is required.
        const createVideo = (id, webSocketUri, authorizationToken) => {
            let player = document.createElement('lva-rtsp-player')
            player.id = "video" + id.toString();
            player.webSocketUri = webSocketUri;
            player.rtspUri = "rtsp://localhost:8554/test";
            player.style.width = "720px";
            player.style.height = "405px";
            player.authorizationToken = authorizationToken;
            let videoRootContainer = document.getElementById("videoRootContainer" + pipelineName);
            videoRootContainer.append(player);

            // Set controls
            document.querySelector('lva-rtsp-player').shadowRoot.querySelector('video').controls = true;
        }

        createVideo(videoId++, wsHost, websocketToken);
        this.setState({ videoReady: true });
    }

    getAlarmText(alert) {
        const now = alert.timestamp.toLocaleString().split(",");
        const tag = alert.inference.inferences[0].entity.tag.value;
        return `Alert: Detected ${tag} at ${now[0]} at ${now[1].trim()}.`;
    }

    render() {
        const { livePipeline, alertFired, videoReady } = this.state;
        return (
           this.state.loadingLivePipelines
                ?
                <p><em>Loading Edge Live Pipelines...</em></p>
                :
                livePipeline.edgePipeline === undefined ?
                    <div>
                        There is no active live pipeline.
                    </div>
                :
                <div>
                    <h5 id="tabelLabel">Instead of just sitting and watching the camera feed, let's see how we can use AVA to alert us about vehicle detection. Here's what we need to do:</h5>
                    <br/>
                    <div className="div-table">
                        <div className="div-table-row">
                            <div className="div-table-col" align="center">1. Connect a camera to AVA</div>
                            <div className="div-table-col"><img src={CheckImage} /></div>
                        </div>
                        <div className="div-table-row">
                            <div className="div-table-col">2. Add AI to detect objects</div>
                            <div className="div-table-col">
                                {
                                    livePipeline.edgePipeline.properties.state === "Inactive" ? (
                                        <button className="btn btn-primary" onClick={() => this.changeStateLivePipeline(livePipeline.edgePipeline.name, livePipeline.edgePipeline.properties.state)}>Start processing</button>
                                    )
                                    :
                                    (
                                        <button className="btn btn-primary" onClick={() => this.changeStateLivePipeline(livePipeline.edgePipeline.name, livePipeline.edgePipeline.properties.state)}>Stop processing</button>
                                    )
                                }
                            </div>
                        </div>
                        <div className="div-table-row">
                            <div className="div-table-col">3. Get alerts with the camera's link</div>
                            <div className="div-table-col">{alertFired.fired ? <img src={CheckImage}/> : null} </div>
                        </div>
                        <div className="div-table-row">
                            <div className="div-table-col">4. View the camera footage</div>
                            <div className="div-table-col">{videoReady ? <img src={CheckImage} /> : null}</div>
                            <br /><br/>
                        </div>
                        <div className="div-table-row">
                            <div className="div-table-col">
                                <div>
                                    {
                                        alertFired.fired ?
                                            <div>
                                                <img src={AlertImage} />&nbsp;<label style={{ color: 'red' }}>{this.getAlarmText(alertFired)}</label><br />
                                                Click <label onClick={() => this.getVideoPlayback(livePipeline.edgePipeline.name)}><b>here</b></label> to view camera feed.
                                            </div>
                                        :
                                            null
                                        }
                                </div>
                            </div>
                            <div className="div-table-col">
                                <div>
                                    <div id={"videoRootContainer" + livePipeline.edgePipeline.name}>
                                        {/*lva-rtsp-player instances will be added here*/}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
        );
    }
}