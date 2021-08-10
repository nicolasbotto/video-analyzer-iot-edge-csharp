import React, { Component } from 'react';
import CloudApi from '../helpers/CloudApi';

const RtspDeviceIdParameter = "rtspDeviceIdParameter";

export class Cloud extends Component {
    static displayName = Cloud.name;

    constructor(props) {
        super(props);
        this.api = new CloudApi();

        this.state = {
            videoAnalyzers: [],
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
            deviceId: "",
            videoTitle: "",
            videoDescription: "",
            livePipelineTopologyName: "",
            livePipelineState: "inactive",
            livePipelineEnabled: false,
            pipelineTopologiesEnabled: false,
            appSettings: null,
            showDeviceId: false
        };
        this.token = null;
        this.deletePipelineTopology = this.deletePipelineTopologyOperation.bind(this);
        this.createPipelineTopology = this.createPipelineTopologyOperation.bind(this);
        this.createLivePipeline = this.createLivePipelineOperation.bind(this);
        this.deleteLivePipeline = this.deleteLivePipelineOperation.bind(this);
        this.changeStateLivePipeline = this.changeStateLivePipelineOperation.bind(this);
    }

    async componentDidMount() {
        await this.api.init();
        await this.getConfig();
        await this.getToken();
        await this.listVideoAnalyzers();
        await this.getPipelinesTopologies();
        await this.getLivePipelines();
    }

    async getToken() {
        this.token = await this.api.getToken();
    }

    async getConfig() {
        const settings = await this.api.getConfig();
        this.setState({ appSettings: settings });
    }

    async deleteLivePipelineOperation(livePipeline) {
        try {
            await this.api.deleteLivePipeline(livePipeline);
            await this.getLivePipelines();
        }
        catch (e) {
            alert(`Cannot delete livepipeline: ${e}`);
        }
    }

    async deleteVideoOperation(videoName) {
        try {
            await this.api.deleteVideo(videoName);
        }
        catch (e) {
            alert(`Cannot delete video ${videoName}: ${e}`);
        }
    }

    async deletePipelineTopologyOperation(pipelineTopologyName) {
        try {
            await this.api.deletePipelineTopology(pipelineTopologyName);
            await this.getPipelinesTopologies();
        }
        catch (e) {
            alert(`Cannot delete pipelineTopology: ${e}`);
        }
    }

    async createPipelineTopologyOperation(event) {
        event.preventDefault();
        const { pipelineTopologyName, behindProxy } = this.state;
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
                        "name": "videoTitleParameter",
                        "type": "String",
                        "description": "video title parameter",
                        "default": "Sample Video Title"
                    },
                    {
                        "name": "videoDescriptionParameter",
                        "type": "String",
                        "description": "video Description parameter",
                        "default": "Sample Video Description"
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
                            "title": "${videoTitleParameter}",
                            "description": "${videoDescriptionParameter}",
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

        if (behindProxy) {
            let parameters = body.Properties.parameters;
            const deviceIdParam = {
                "name": RtspDeviceIdParameter,
                "type": "String",
                "description": "device id parameter"
            }
            parameters.push(deviceIdParam);

            let source = body.Properties.sources.pop();
            let endpoint = source.endpoint;
            source.endpoint = {
                ...endpoint, "tunnel": {
                    "@type": "#Microsoft.VideoAnalyzer.IotSecureDeviceRemoteTunnel",
                    "deviceId": "${" + RtspDeviceIdParameter + "}",
                    "iotHubArmId": ioTHubArmId,
                    "userAssignedManagedIdentityArmId": ioTHubUserAssignedManagedIdentityArmId
                }
            };

            body.Properties.sources.push(source);
        }
       
        try {
            await this.api.createPipelineTopology(body);
            this.setState({ pipelineTopologyName: "", videoName: "", behindProxy: false }, async () =>
                await this.getPipelinesTopologies());
        }
        catch (e) {
            alert(`Cannot create the pipelineTopology: ${e}`);
        }
        finally {
            this.setState({ loadingPipelineTopologies: false });
        }
    }

    async createLivePipelineOperation(event) {
        event.preventDefault();
        const { livePipelineName, rtspUrl, rtspUsername, rtspPassword, livePipelineTopologyName, videoName, deviceId, showDeviceId, videoTitle, videoDescription } = this.state;

        let body = {
            "name": livePipelineName,
            "properties": {
                "topologyName": livePipelineTopologyName,
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
                        "name": "videoTitleParameter",
                        "value": videoTitle
                    },
                    {
                        "name": "videoDescriptionParameter",
                        "value": videoDescription
                    }
                ]
            }
        }

        if (showDeviceId && deviceId.length > 0) {
            const deviceParam = {
                "name": RtspDeviceIdParameter,
                "value": deviceId
            };

            body.properties.parameters.push(deviceParam);
        }

        try {
            await this.api.createLivePipeline(body);
            this.setState({ livePipelineName: "", rtspUrl: "", rtspUsername: "", rtspPassword: "", livePipelineTopologyName: "", videoName: "", videoTitle: "", videoDescription: ""  },
                async () => await this.getLivePipelines());
        }
        catch (e) {
            alert(`Cannot create livepipeline: ${e}`);
        }
        finally {
            this.setState({ loadingLivePipelines: false });
        }
    }

    async changeStateLivePipelineOperation(livePipeline, properties) {
        try {
            const action = properties.state.toUpperCase() === "INACTIVE" ? "activate" : "deactivate";
            await this.api.changeStateLivePipeline(livePipeline, action);
            await this.getLivePipelines();

            if (properties.state !== "inactive") {
                this.deleteVideoPlayer(livePipeline);
            }
        }
        catch (e) {
            alert(e);
        }
    }

    async getPipelinesTopologies() {
        try {
            let data = await this.api.getPipelinesTopologies();
            this.setState({ pipelineTopologies: data });
        }
        catch (e) {
            alert(e);
        }
        finally {
            this.setState({ loadingPipelineTopologies: false });
        }
    }

    async getLivePipelines() {
        try {
            let data = await this.api.getLivePipelines();
            this.setState({ livePipelines: data });
        }
        catch (e) {
            alert(e);
        }
        finally {
            this.setState({ loadingLivePipelines: false });
        }
    }

    async getVideoPlayback(videoName, pipelineName) {
        
        try {
            let response = await this.api.getVideoPlayback(videoName);
            this.renderVideoPlayer(response.tunneledRtspUrl, response.playbackToken, pipelineName);
        }
        catch (e) {
            alert(e);
        }
    }

    async listVideoAnalyzers() {
        try {
            let data = await this.api.getVideoAnalyzers();
            this.setState({ videoAnalyzers: data });
        }
        catch (e) {
            alert(e);
        }
        finally {
            this.setState({ loading: false });
        }
    }

    setFormData(event) {
        const { pipelineTopologies, showDeviceId } = this.state;
        const elementType = event.target.parentElement.parentElement.parentElement.parentElement.parentElement.name;
        const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
        let isBehindProxy = showDeviceId;

        if (event.target.type === "select-one" && value !== "") {
            const selectedPipelineTopology = pipelineTopologies.find(x => x.name === value);

            if (selectedPipelineTopology != null) {
                const result = selectedPipelineTopology.properties.parameters.find(x => x.name === RtspDeviceIdParameter);
                isBehindProxy = result != undefined;
            }
        }

        this.setState({
            ...this.state,
            [event.target.name]: value,
            showDeviceId: isBehindProxy
        }, () => this.validate(elementType));
    }

    validate(elementType) {
        const { livePipelineName, rtspUrl, rtspUsername, rtspPassword, livePipelineTopologyName, videoName, pipelineTopologyName, showDeviceId, deviceId } = this.state;

        let isLivePipelineValid = false;
        let isPipelineTopologiesValid = false;

        if (elementType === "livepipeline") {
            isLivePipelineValid = livePipelineName.length > 0 && rtspUrl.length > 0 && rtspUsername.length > 0 && rtspPassword.length > 0 && livePipelineTopologyName.length > 0 && videoName.length > 0;

            if (showDeviceId) {
                isLivePipelineValid = isLivePipelineValid && deviceId.length > 0;
            }
        }
        else {
            isPipelineTopologiesValid = pipelineTopologyName !== undefined && pipelineTopologyName.length > 0;
        }

        this.setState({
            livePipelineEnabled: isLivePipelineValid,
            pipelineTopologiesEnabled: isPipelineTopologiesValid
        });
    }

    renderVideoAnalyzers() {
        const { videoAnalyzers } = this.state;
        return (
            <div>
                <h3>Video Analyzers</h3>
                <table className='table table-striped' aria-labelledby="tabelLabel">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Id</th>
                            <th>Location</th>
                            <th>Type</th>
                        </tr>
                    </thead>
                    <tbody>
                        {
                            videoAnalyzers.map((data, index) =>
                                <tr key={index}>
                                    <td>{data.name}</td>
                                    <td>{data.id}</td>
                                    <td>{data.location}</td>
                                    <td>{data.type}</td>
                                </tr>
                            )}
                    </tbody>
                </table>
            </div>
        );
    }

    renderPipelineTopologies() {
        const { pipelineTopologies } = this.state;
        return (
            <div>
                <h3>Cloud Pipeline Topologies</h3>
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
                                            {data.properties.parameters.map((p,i) =>
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

                <h5>Add new</h5>
                <form name="pipelinetopology" onSubmit={(e) => this.createPipelineTopology(e)}>
                    <div className="div-table">
                        <div className="div-table-row">
                            <div className="div-table-col-new-pipeline">Behind proxy:</div>
                            <div className="div-table-col"><input type="checkbox" checked={this.state.behindProxy} name="behindProxy" onChange={(e) => this.setFormData(e)} /></div>
                        </div>
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
        );
    }

    renderLivePipelines() {
        const { livePipelines } = this.state;
        return (
            <div>
                <h3>Cloud Live Pipelines</h3>
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
                                            data.properties.state === "inactive" ? (
                                                <button className="btn btn-primary" onClick={() => this.changeStateLivePipeline(data.name, data.properties)}>Activate</button>
                                            )
                                            :
                                            (
                                                <div>
                                                    <button className="btn btn-primary" onClick={() => this.changeStateLivePipeline(data.name, data.properties)}>Deactivate</button><br /><br />
                                                    <button className="btn btn-primary" onClick={() => this.getVideoPlayback(data.properties.parameters.find(x => x.name === "videoNameParameter").value, data.name)}>Play video</button>
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
                        <div className="div-table">
                            <div className="div-table-row">
                                <div className="div-table-col-new-pipeline">Name:</div>
                                <div className="div-table-col">
                                    <input name="livePipelineName" value={this.state.livePipelineName} onChange={(e) => this.setFormData(e)} className="input" />
                                </div>
                            </div>
                        </div>
                        <div className="div-table">
                            <div className="div-table-row">
                                <div className="div-table-col-new-pipeline">rtsp Url:</div>
                                <div className="div-table-col">
                                    <input name="rtspUrl" value={this.state.rtspUrl} onChange={(e) => this.setFormData(e)} placeholder="rtsp://rtspsim:554/media/lots_015.mkv" className="input" />
                                </div>
                            </div>
                        </div>
                        <div className="div-table">
                            <div className="div-table-row">
                                <div className="div-table-col-new-pipeline">rtsp Username:</div>
                                <div className="div-table-col">
                                    <input name="rtspUsername" value={this.state.rtspUsername} onChange={(e) => this.setFormData(e)} placeholder="username" className="input" />
                                </div>
                            </div>
                        </div>
                        <div className="div-table">
                            <div className="div-table-row">
                                <div className="div-table-col-new-pipeline">rtsp Password:</div>
                                <div className="div-table-col">
                                    <input type="password" name="rtspPassword" value={this.state.rtspPassword} onChange={(e) => this.setFormData(e)} placeholder="*******" className="input" />
                                </div>
                            </div>
                        </div>
                        <div className="div-table">
                            <div className="div-table-row">
                                <div className="div-table-col-new-pipeline">Video name:</div>
                                <div className="div-table-col">
                                    <input name="videoName" value={this.state.videoName} onChange={(e) => this.setFormData(e)} placeholder="SampleVideo" className="input" />
                                </div>
                            </div>
                        </div>
                        <div className="div-table">
                            <div className="div-table-row">
                                <div className="div-table-col-new-pipeline">Video description:</div>
                                <div className="div-table-col">
                                    <input name="videoDescription" value={this.state.videoDescription} onChange={(e) => this.setFormData(e)} placeholder="Sample video description" className="input" />
                                </div>
                            </div>
                        </div>
                        <div className="div-table">
                            <div className="div-table-row">
                                <div className="div-table-col-new-pipeline">Video title:</div>
                                <div className="div-table-col">
                                    <input name="videoTitle" value={this.state.videoTitle} onChange={(e) => this.setFormData(e)} placeholder="Sample video title" className="input" />
                                </div>
                            </div>
                        </div>
                        {
                            this.state.showDeviceId ?
                            <div className="div-table">
                                <div className="div-table-row">
                                    <div className="div-table-col-new-pipeline">Device id:</div>
                                    <div className="div-table-col">
                                        <input name="deviceId" value={this.state.deviceId} onChange={(e) => this.setFormData(e)} placeholder="Camera01" className="input" />
                                    </div>
                                </div>
                            </div>
                            :
                            null
                        }
                    </div>
                    <button className="btn btn-primary" type="submit" disabled={!this.state.livePipelineEnabled}>Create</button>
                </form>
            </div>
        );
    }

    renderVideoPlayer(wsHost, websocketToken, pipelineName) {
        let videoId = 0;

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
        let videoAnalyzers = this.state.loading
            ? <p><em>Loading Video Analyzers...</em></p>
            : this.renderVideoAnalyzers();

        let pipelineTopologies = this.state.loadingPipelineTopologies
            ? <p><em>Loading Cloud Pipeline Topologies... </em></p>
            : this.renderPipelineTopologies();

        let livePipelines = this.state.loadingPipelineTopologies && this.state.loadingLivePipelines
            ? <p><em>Loading Cloud Live Pipelines...</em></p>
            : this.renderLivePipelines();

        return (
            <div>
                <h1 id="tabelLabel" >Cloud</h1>
                <p>This component demonstrates fetching Video Analyzers.</p>
                {videoAnalyzers}
                <hr />
                <br/>
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