import React, { Component } from 'react';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import CloudApi from '../helpers/CloudApi';

export class Edge extends Component {
    static displayName = Edge.name;
    static numberOfEvents = 10;

    constructor(props) {
        super(props);
        this.api = new CloudApi();
        this.api.init();

        this.state = {
            pipelineTopologies: [],
            livePipelines: [],
            loading: true,
            loadingPipelineTopologies: true,
            loadingLivePipelines: true,
            behindProxy: false,
            videoName: "",
            livePipelineName: "",
            rtspUrl: "",
            rtspUsername: "",
            rtspPassword: "",
            livePipelineTopologyName: "",
            livePipelineState: "inactive",
            livePipelineEnabled: false,
            pipelineTopologiesEnabled: false,
            connection: null,
            events: {},
            appSettings: {},
            deviceId: "",
            activeLivePipeline: "",
            cloudLivePipelines: [],
            loading: true
        };

        this.token = null;
        this.deletePipelineTopology = this.deletePipelineTopologyOperation.bind(this);
        this.createPipelineTopology = this.createPipelineTopologyOperation.bind(this);
        this.createLivePipeline = this.createLivePipelineOperation.bind(this);
        this.deleteLivePipeline = this.deleteLivePipelineOperation.bind(this);
        this.changeStateLivePipeline = this.changeStateLivePipelineOperation.bind(this);
    }

    async componentDidMount() {
        await this.getConfig();
        await this.getPipelinesTopologies();
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
            console.log('Added event');
            const { events } = this.state;

            let updatedEvents = { ...events };

            if (events[pipelineName] === undefined) {
                let newEvent = { [pipelineName]: [] };
                updatedEvents = { ...updatedEvents, ...newEvent };
            }

            updatedEvents[pipelineName].push(eventData);

            this.setState({ events: updatedEvents }, async () => {
                if (updatedEvents[pipelineName].length == Edge.numberOfEvents) {
                    await this.stopToEvent(pipelineName);
                }
            });
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

    async deleteLivePipelineOperation(livePipeline) {
        const { cloudLivePipelines } = this.state;
        const url = `/VideoAnalyzer/LivePipelineDelete?livePipelineName=${livePipeline}`;
        try {
            const response = await fetch(url, {
                method: 'DELETE'
            });

            if (response.ok) {
                await this.getLivePipelines();

                // Delete Cloud LivePipeline
                try {
                    this.api.deleteLivePipeline(livePipeline);

                    // Delete Video
                    const pipelineObj = cloudLivePipelines.find(x => x.name == livePipeline);

                    if (pipelineObj !== undefined) {
                        const videoName = pipelineObj.properties.parameters.find(x => x.name === "videoNameParameter").value;
                        this.api.deleteVideo(videoName);
                    }

                    const newCloudLivePipelines = cloudLivePipelines.filter(x => x.name != livePipeline)

                    // Remove Cloud LivePipeline
                    this.setState({ cloudLivePipelines: newCloudLivePipelines });
                }
                catch (cloudEx) {
                    throw new Error(`Cannot delete the Cloud LivePipeline ${livePipeline}: ${cloudEx}`);
                }
            }
            else {
                const errorMessageObj = JSON.parse(await response.json());
                throw new Error(`Cannot delete LivePipeline: ${errorMessageObj.error.message}`);
            }
        }
        catch (e) {
            alert(e);
        }
    }

    async deletePipelineTopologyOperation(pipelineTopologyName) {
        const url = `/VideoAnalyzer/PipelineTopologyDelete?pipelineTopologyName=${pipelineTopologyName}`;
        try {
            const response = await fetch(url, {
                method: 'DELETE'
            });

            if (response.ok) {
                await this.getPipelinesTopologies();

                // Delete Cloud PipelineTopology
                try {
                    this.api.deletePipelineTopology(pipelineTopologyName);
                }
                catch (cloudEx) {
                    throw new Error(`Cannot delete the Cloud PipelineTopology ${pipelineTopologyName}: ${cloudEx}`);
                }
            }
            else {
                const errorMessageObj = JSON.parse(await response.json());
                const errorMessage = errorMessageObj.error.details.map(x => x.message);
                throw new Error(`Cannot delete pipelineTopology: ${errorMessage}`);
            }
        }
        catch (e) {
            alert(e);
        }
    }

    createPipelineTopologyBody(pipelineTopologyName) {
        const { ioTHubArmId, ioTHubUserAssignedManagedIdentityArmId } = this.state.appSettings;

        let body = {
            "Name": pipelineTopologyName,
            "Kind": "liveUltraLowLatency",
            "Sku": {
                "Name": "S1",
                "Tier": "Standard"
            },
            "Properties": {
                "description": "pipeline topology test description",
                "parameters": [
                    {
                        "name": "rtspUrlParameter",
                        "type": "String",
                        "description": "rtsp source url parameter"
                    },
                    {
                        "name": "rtspUsernameParameter",
                        "type": "String",
                        "description": "rtsp source username parameter"
                    },
                    {
                        "name": "rtspPasswordParameter",
                        "type": "SecretString",
                        "description": "rtsp source password parameter"
                    },
                    {
                        "name": "videoNameParameter",
                        "type": "String",
                        "description": "video name parameter"
                    },
                    {
                        "name": "rtspDeviceIdParameter",
                        "type": "String",
                        "description": "device id parameter"
                    }
                ],
                "sources": [
                    {
                        "@type": "#Microsoft.VideoAnalyzer.RtspSource",
                        "name": "rtspSource",
                        "transport": "tcp",
                        "endpoint": {
                            "@type": "#Microsoft.VideoAnalyzer.UnsecuredEndpoint",
                            "url": "${rtspUrlParameter}",
                            "credentials": {
                                "@type": "#Microsoft.VideoAnalyzer.UsernamePasswordCredentials",
                                "username": "${rtspUsernameParameter}",
                                "password": "${rtspPasswordParameter}"
                            },
                            "tunnel": {
                                "@type": "#Microsoft.VideoAnalyzer.IotSecureDeviceRemoteTunnel",
                                "deviceId": "${rtspDeviceIdParameter}",
                                "iotHubArmId": ioTHubArmId,
                                "userAssignedManagedIdentityArmId": ioTHubUserAssignedManagedIdentityArmId
                            }
                        }
                    }
                ],
                "sinks": [
                    {
                        "@type": "#Microsoft.VideoAnalyzer.VideoSink",
                        "name": "videoSink",
                        "videoName": "${videoNameParameter}",
                        "videoCreationProperties": {
                            "title": "Video title",
                            "description": "Video description",
                            "segmentLength": "PT30S"
                        },
                        "inputs": [
                            {
                                "nodeName": "rtspSource"
                            }
                        ]
                    }
                ]
            }
        };

        return body;
    }

    createLivePipelineBody(pipelineTopologyName, livePipelineName, videoName, rtspUrl, rtspUsername, rtspPassword, deviceId) {
        let body = {
            "name": livePipelineName,
            "properties": {
                "topologyName": pipelineTopologyName,
                "description": "live pipeline test description",
                "bitrateKbps": 500,
                "parameters": [
                    {
                        "name": "rtspUrlParameter",
                        "value": rtspUrl
                    },
                    {
                        "name": "rtspUsernameParameter",
                        "value": rtspUsername
                    },
                    {
                        "name": "rtspPasswordParameter",
                        "value": rtspPassword
                    },
                    {
                        "name": "videoNameParameter",
                        "value": videoName
                    },
                    {
                        "name": "rtspDeviceIdParameter",
                        "value": deviceId
                    }
                ]
            }
        }

        return body;
    }

    async createPipelineTopologyOperation(event) {
        event.preventDefault();
        const { pipelineTopologyName } = this.state;
        

        const url = `/VideoAnalyzer/PipelineTopologySet?pipelineTopologyName=${pipelineTopologyName}`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    "Content-Type": "application/json"
                }
            });

            if (response.ok) {
                this.setState({ pipelineTopologyName: "", videoName: "", behindProxy: false }, async () =>
                    await this.getPipelinesTopologies());

                // Create Cloud PipelineTopology
                try {
                    const body = this.createPipelineTopologyBody(pipelineTopologyName);
                    this.api.createPipelineTopology(body);
                }
                catch (cloudEx) {
                    throw new Error(`Cannot create the PipelineTopology: ${cloudEx}`);
                }
            }
            else {
                const errorMessageObj = await response.json();
                throw new Error(`Cannot create the pipelineTopology: ${errorMessageObj.error.message}`);
            }
        }
        catch (e) {
            alert(e);
        }
        finally {
            this.setState({ loadingPipelineTopologies: false });
        }
    }

    async createLivePipelineOperation(event) {
        event.preventDefault();
        const { cloudLivePipelines, livePipelineName, rtspUrl, rtspUsername, rtspPassword, livePipelineTopologyName, videoName, deviceId } = this.state;

        const body = {
            pipelineTopologyName: livePipelineTopologyName,
            livePipelineName: livePipelineName,
            username: rtspUsername,
            password: rtspPassword,
            url: rtspUrl
        };

        const url = '/VideoAnalyzer/LivePipelineSet';
        
        try {
            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(body)
            });

            if (response.ok) {
                this.setState({ livePipelineName: "", rtspUrl: "", rtspUsername: "", rtspPassword: "", livePipelineTopologyName: "", videoName: "", deviceId: ""},
                    async () => await this.getLivePipelines());

                // Create Cloud LivePipeline
                try {
                    const body = this.createLivePipelineBody(livePipelineTopologyName, livePipelineName, videoName, rtspUrl, rtspUsername, rtspPassword, deviceId);
                    await this.api.createLivePipeline(body);
                    cloudLivePipelines.push(body);
                }
                catch (cloudEx) {
                    alert(`Cannot create the Cloud LivePipeline: ${cloudEx}`);
                }
            }
            else {
                const errorMessageObj = await response.json();
                alert(`Cannot create the LivePipeline: ${errorMessageObj.error.message}`);
            }
        }
        catch (e) {
            alert(`Cannot create the Cloud LivePipeline: ${e}`);
        }
        finally {
            this.setState({ loadingLivePipelines: false });
        }
    }

    async checkStatus(asyncOpUrl) {
        const token = this.token;
        
        try {
            const asyncResponse = await fetch(asyncOpUrl, {
                method: 'GET',
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

            if (asyncResponse.ok) {
                const jsonResp = JSON.parse(await asyncResponse.text());
                if (jsonResp.status === "Running") {
                    return await this.checkStatus(asyncOpUrl);
                } else if (jsonResp.status === "Succeeded") {
                    return true;
                }
                else {
                    return false;
                }
            }
            else {
                throw new Error(await asyncResponse.text());
            }
        }
        catch (e) {
            throw new Error(e);
        }
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

                    this.setState({ activeLivePipeline: "", events: updatedEvents });
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

    async getPipelinesTopologies() {
        const url = '/VideoAnalyzer/PipelineTopologyList';
        try {
            const response = await fetch(url, {
                method: 'GET'
            });

            var data = [];

            if (response.ok) {
                const jsonResponse = await response.json();
                data = jsonResponse;
            }
            else {
                console.log(response.statusText);
            }

            this.setState({ pipelineTopologies: data });
        }
        catch (e) {
            console.log(e);
        }
        finally {
            this.setState({ loadingPipelineTopologies: false });
        }
    }

    async getLivePipelines() {
        const url = '/VideoAnalyzer/LivePipelineList';
        try {
            const response = await fetch(url, {
                method: 'GET'
            });

            let data = [];
            let cloudLivePipelines = [];
            

            if (response.ok) {
                const jsonResponse = await response.json();
                data = JSON.parse(jsonResponse);
                cloudLivePipelines = await this.api.getLivePipelines();
            }
            else {
                console.log(response.statusText);
            }

            this.setState({ livePipelines: data, cloudLivePipelines: cloudLivePipelines }, async () => {
                data.forEach(async(pipeline) => {
                    if (pipeline.properties.state.toLowerCase() === "active") {
                        await this.getVideoPlayback(pipeline.name);
                    }
                })
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
            const { cloudLivePipelines } = this.state;
            const pipelineObj = cloudLivePipelines.find(x => x.name == pipelineName);

            if (pipelineObj !== undefined) {
                const videoName = pipelineObj.properties.parameters.find(x => x.name === "videoNameParameter").value;
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
        const { events } = this.state;
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

    setFormData(event) {
        const elementType = event.target.parentElement.parentElement.parentElement.parentElement.name;
        const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
        this.setState({
            ...this.state,
            [event.target.name]: value
        }, () => this.validate(elementType));
    }

    validate(elementType) {
        const { livePipelineName, rtspUrl, rtspUsername, rtspPassword, livePipelineTopologyName, videoName, pipelineTopologyName, deviceId } = this.state;

        let isLivePipelineValid = false;
        let isPipelineTopologiesValid = false;

        if (elementType === "livepipeline") {
            isLivePipelineValid = livePipelineName.length > 0 && rtspUrl.length > 0 && rtspUsername.length > 0 && rtspPassword.length > 0 && livePipelineTopologyName.length > 0 && videoName.length > 0 && deviceId.length > 0;
        }
        else {
            isPipelineTopologiesValid = pipelineTopologyName.length;
        }

        this.setState({
            livePipelineEnabled: isLivePipelineValid,
            pipelineTopologiesEnabled: isPipelineTopologiesValid
        });
    }

    renderPipelineTopologies() {
        const { pipelineTopologies } = this.state;
        return (
            <div>
                <h3>Edge Pipeline Topologies</h3>
                <table className='table table-striped' aria-labelledby="tabelLabel">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Description</th>
                            <th>Parameters</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {
                            pipelineTopologies.map((data, index) =>
                                <tr key={index}>
                                    <td>{data.name}</td>
                                    <td>{data.properties.description}</td>
                                    <td>
                                        <ul>
                                            {data.properties.parameters.filter(x => x.name.includes("rtsp")).map((p,i) =>
                                                <li key={i}>{p.name}</li>
                                            )}
                                        </ul>
                                    </td>
                                    <td>
                                        <button className="btn btn-primary" onClick={() => this.deletePipelineTopology(data.name)}>Delete</button>
                                    </td>
                                </tr>
                            )}
                    </tbody>
                </table>
                {
                    pipelineTopologies.length == 0 ?
                        <div>
                            <h5>Create a HTTP inferencing topology using YOLOv3-based inference server</h5>
                            See <a href="https://github.com/Azure/video-analyzer/tree/main/pipelines/live/topologies/httpExtension" title="See pipeline topology">Pipeline Topology</a>
                            <form name="pipelinetopology" onSubmit={(e) => this.createPipelineTopology(e)}>
                                <div className="div-table">
                                    <div className="div-table-row">
                                        <div className="div-table-col-new-pipeline">Name:</div>
                                        <div className="div-table-col">
                                            <input name="pipelineTopologyName" value={this.state.pipelineTopologyName} onChange={(e) => this.setFormData(e)} className="input" />
                                        </div>
                                    </div>
                                </div>
                                <button className="btn btn-primary" type="submit" disabled={!this.state.pipelineTopologiesEnabled}>Create</button>
                            </form>
                        </div>
                    :
                    null
                }
            </div>
        );
    }

    renderLivePipelines() {
        const { livePipelines } = this.state;
        return (
            <div>
                <h3>Edge Live Pipelines</h3>
                <table className='table table-striped' aria-labelledby="tabelLabel">
                    <tbody>
                        {
                            livePipelines.map((data, index) =>
                                <div>
                                <tr>
                                    <th>Name</th>
                                    <th>Description</th>
                                    <th>Topology</th>
                                    <th>State</th>
                                    <th>Parameters</th>
                                    <th>Action</th>
                                </tr>
                                <tr key={index}>
                                    <td>{data.name}</td>
                                    <td>{data.properties.description}</td>
                                    <td>{data.properties.topologyName}</td>
                                    <td>{data.properties.state}</td>
                                    <td>
                                        <ul>
                                            {data.properties.parameters.map((p, i) =>
                                                <li key={i}>{p.name}: <b>{p.value === undefined ? "**********" : p.value}</b></li>
                                            )}
                                        </ul>
                                    </td>
                                    <td>
                                        <button className="btn btn-primary" onClick={() => this.deleteLivePipeline(data.name)}>Delete</button><br /><br />
                                        {
                                            data.properties.state === "Inactive" ? (
                                                <button className="btn btn-primary" onClick={() => this.changeStateLivePipeline(data.name, data.properties.state)}>Activate</button>
                                            )
                                            :
                                            (
                                                <div>
                                                    <button className="btn btn-primary" onClick={() => this.changeStateLivePipeline(data.name, data.properties.state)}>Deactivate</button><br /><br />
                                                    {
                                                                
                                                            <div>
                                                                <button className="btn btn-primary" onClick={() => this.getVideoPlayback(data.name)}>Monitor camera output</button>
                                                                <img src="/information.png" className="icon" title="View a low latency RTSP feed from the camera relayed via AVA" />
                                                            </div>
                                                                   
                                                    }
                                                </div>
                                            )
                                        }
                                    </td>
                                    </tr>
                                    <tr>
                                        <td colSpan="6">
                                            <div>
                                                <div id={"videoRootContainer" + data.name}>
                                                    {/*lva-rtsp-player instances will be added here*/}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td colSpan="6">
                                            {
                                                (this.state.events[data.name] !== undefined && this.state.events[data.name].length > 0) ?
                                                    <div><h4>Events</h4>
                                                        <div className="events">
                                                            <ul>
                                                                {this.state.events[data.name].map((p, i) =>
                                                                    <li key={i}>{p}</li>
                                                                )}
                                                            </ul>
                                                        </div>
                                                    </div>
                                                :
                                                null
                                            }
                                        </td>
                                    </tr>
                                    <tr><td colSpan="6"></td></tr>
                                </div>
                            )}
                    </tbody>
                </table>
                <h5>Add new</h5>
                <form name="livepipeline" onSubmit={(e) => this.createLivePipeline(e)}>
                    <div className="div-table">
                        <div className="div-table-row">
                            <div className="div-table-col-new-pipeline">Topology Name:</div>
                            <div className="div-table-col">
                                <select name="livePipelineTopologyName" value={this.state.livePipelineTopologyName} onChange={(e) => this.setFormData(e)} className="input">
                                    <option value="">Select:</option>
                                    {
                                        this.state.pipelineTopologies.map((item, index) =>
                                            <option key={index} value={item.name}>{item.name}</option>
                                        )
                                    }
                                </select>
                            </div>
                        </div>
                        <div className="div-table-row">
                            <div className="div-table-col-new-pipeline">Name:</div>
                            <div className="div-table-col">
                                <input name="livePipelineName" value={this.state.livePipelineName} onChange={(e) => this.setFormData(e)} className="input" />
                            </div>
                        </div>
                        <div className="div-table-row">
                            <div className="div-table-col-new-pipeline">rtps Url:</div>
                            <div className="div-table-col">
                                <input name="rtspUrl" value={this.state.rtspUrl} onChange={(e) => this.setFormData(e)} placeholder="rtsp://rtspsim:554/media/lots_015.mkv" className="input" />
                            </div>
                        </div>
                        <div className="div-table-row">
                            <div className="div-table-col-new-pipeline">rtps Username:</div>
                            <div className="div-table-col">
                                <input name="rtspUsername" value={this.state.rtspUsername} onChange={(e) => this.setFormData(e)} placeholder="username" className="input" />
                            </div>
                        </div>
                        <div className="div-table-row">
                            <div className="div-table-col-new-pipeline">rtsp Password:</div>
                            <div className="div-table-col">
                                <input type="password" name="rtspPassword" value={this.state.rtspPassword} onChange={(e) => this.setFormData(e)} placeholder="*******" className="input" />
                            </div>
                        </div>
                        <div className="div-table-row">
                            <div className="div-table-col-new-pipeline">Video name:</div>
                            <div className="div-table-col">
                                <input name="videoName" value={this.state.videoName} onChange={(e) => this.setFormData(e)} placeholder="SampleVideo" className="input" />
                            </div>
                        </div>
                        <div className="div-table-row">
                            <div className="div-table-col-new-pipeline">Device id:</div>
                            <div className="div-table-col">
                                <input name="deviceId" value={this.state.deviceId} onChange={(e) => this.setFormData(e)} placeholder="Camera1" className="input" />
                            </div>
                        </div>
                    </div>
                    <button className="btn btn-primary" type="submit" disabled={!this.state.livePipelineEnabled}>Create</button>
                </form>
            </div>
        );
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
    }

    deleteVideoPlayer(pipelineName) {
        let videoRootContainer = document.getElementById("videoRootContainer" + pipelineName);
        while (videoRootContainer.firstChild) {
            videoRootContainer.firstChild.remove();
        }
    }

    render() {
        let pipelineTopologies = this.state.loadingPipelineTopologies
            ? <p><em>Loading Edge Pipeline Topologies... </em></p>
            : this.renderPipelineTopologies();

        let livePipelines = this.state.loadingPipelineTopologies && this.state.loadingLivePipelines
            ? <p><em>Loading Edge Live Pipelines...</em></p>
            : this.renderLivePipelines();

        return (
            <div>
                <h1 id="tabelLabel" >Edge Device</h1>
                {pipelineTopologies}
                <hr />
                <br />
                {livePipelines}
                <hr />
                <br />
            </div>
        );
    }
}