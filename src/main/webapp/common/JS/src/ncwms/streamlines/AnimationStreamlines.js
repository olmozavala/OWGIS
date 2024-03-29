/* global _map_projection */
goog.provide('owgis.ncwms.currents');
goog.require('ol.source.ImageCanvas');
goog.require('ol.renderer.canvas.ImageLayer');
goog.require('goog.events');
goog.require('owgis.ncwms.currents.particles');
goog.require('owgis.ncwms.ncwmstwo');
goog.require('owgis.ncwms.animation.status');
goog.require('owgis.interf');
goog.require('owgis.transparency');
goog.require('owgis.utilities.mathgeo');

owgis.ncwms.currents.grids = new Array();
var currentsColor = (localStorage.particles_color !== "NaN" && typeof localStorage.particles_color !== 'undefined') ? localStorage.particles_color : "rgba(255, 255, 255, .6)";
var currentsDefColor = "rgba(255, 255, 255, .6)";
var currAnimSpeed = 80;//Miliseconds to wait (80)
var defLineWidth = 1.7;
var defLineWidthCesium = 2.5;
var currentsText = 'Loading ';
// This is the amount of data requested for every 800 pixels
//var imageRequestResolution = 650;
var imageRequestResolution = 800;
var layerTemplate;
var times = new Array();
var intervalHandlerCurrents;// This is the handler of the 'interval' function
var canvas;
var ctx;
var currentExtent;
var streamlineLayer;
var grids;
var gridsHeaders;
var readDataPremises;
// This is the estimated file size for a screen with 800x800 pixels
var estimatedFileSize = 20000;
var animationPaused = false;
//This variable is used to stop refreshing the data when the 'main' animation is
// running. Afther all the images have been loaded the the particles data is reloaded
var isRunningUnderMainAnimation = false;
var isFirstTime = true;//Only important when been run under main animation
var isFirstTime3D = true;//Only important when been run under main animation
// ------------------ Cesium related -------------
var c_move = false;//Used to detect movement of the mouse
var c_leftdown = false;//Used to detect a left click of the mouse
var c_x = 0.0350; // Used to increase the longitude angle
var c_y = -0.75;// Used to increase the longitude angle
var c_scene;
var c_handler;
var _cesi = null;
var temp_resolution;

// --------- var updateData -----------------------

var resolutionHigh = false;
var isLow = true;
var computedFileSize;
var totalRequests;
var loadedRequests;
var uData;
var vData;
var compositeLayers;
var tempULayer;
var tempVLayer;
var uidx;
var vidx;
var gridInfo;
var temp;
var grid;
var dataCurrent;


window['owgis.ncwms.currents.setColor'] = owgis.ncwms.currents.setColor;
owgis.ncwms.currents.setColor= function setColor(color){
    currentsColor = color;
}
owgis.ncwms.currents.getColor= function getColor(){
    return currentsColor;
}
owgis.ncwms.currents.getDefColor= function getDefColor(){
    return currentsDefColor;
}

/**
 * This function is used to play/pause the animation of the currents. 
 * If not parameters are received it toggles the play/pause. 
 * Else it sets the status depending on the 'pause' parameter 
 * @param {type} pause
 * @returns {undefined}
 */
owgis.ncwms.currents.playPause = function playPause(pause){
    //If the play variable is empty we toogle the animation
    if(!_.isBoolean(pause)){
        animationPaused = !animationPaused;
    }else{
        animationPaused = pause;
    }
    if(!mobile){
        if(animationPaused){
            $("#currentsPlayPauseButton").removeClass("glyphicon-pause");
            $("#currentsPlayPauseButton").addClass("glyphicon-play");
        }else{
            $("#currentsPlayPauseButton").removeClass("glyphicon-play");
            $("#currentsPlayPauseButton").addClass("glyphicon-pause");
        }
    }else{
        if(animationPaused){
            $("#currentsPlayPauseButton").text("Play");
            $("#currentsPlayPauseButton").addClass("ui-icon-play");
            $("#currentsPlayPauseButton").removeClass("ui-icon-pause");
        }else{
            $("#currentsPlayPauseButton").text("Pause");
            $("#currentsPlayPauseButton").addClass("ui-icon-pause");
            $("#currentsPlayPauseButton").removeClass("ui-icon-play");
        }
    }
}

/**
 * Main function that starts the animation of the currents. It reads the
 * current layer data and it is done then starts the animation loop 
 * @returns {undefined}
 */
window['owgis.ncwms.currents.startSingleDateAnimation'] = owgis.ncwms.currents.startSingleDateAnimation;
owgis.ncwms.currents.startSingleDateAnimation = function startSingleDateAnimation(){
    isRunningUnderMainAnimation = false;
    
    //Creates new currents layer model
    layerTemplate = getDefaultLayer();
    layerTemplate.attributes.srs = _map_projection;
    
    times = new Array();
    // Updating current date
    var mainLayerParams = owgis.layers.getMainLayer().getSource().getParams();
    if( !_.isEmpty(mainLayerParams.TIME)){
        times.push( mainLayerParams.TIME);	
    }else{
        times.push( layerDetails.nearestTimeIso );
    }
    
//    console.log("Single date animation, dates:", times);
    //Reads and updates the data
    if(!_.isEmpty(_cesium) && _cesium.getEnabled()){
        $("#currentsCanvas").css({position:'absolute', left:'0px',top:'0px','pointer-events':'none'});
        $(".layersLonLat").hide();
        initstreamlineLayerCesium();
    }else{
        $("#currentsCanvas").removeAttr('style');
        $(".layersLonLat").show();
        initstreamlineLayer();
    }
}

/**
 * Main function that starts the animation of the currents. It reads the
 * current layer data and it is done then starts the animation loop 
 * @returns {undefined}
 */
window['owgis.ncwms.currents.startMultipleDateAnimation'] = owgis.ncwms.currents.startMultipleDateAnimation;
owgis.ncwms.currents.startMultipleDateAnimation = function startMultipleDateAnimation(dates){
    isRunningUnderMainAnimation = true;
    isFirstTime = true;
    //Creates new currents layer model
    times = dates;
    //Adds the only model into the available layers
    layerTemplate = getDefaultLayer();
    layerTemplate.attributes.srs = _map_projection;
    //Reads and updates the data
//    console.log("Multiple date animation, dates:", times);
    initstreamlineLayer();
}

/**
 * Function to change teh definition pf the streamlines, go from 
 * high definition to low definition and vice versa
 * @returns {undefined}
 */
owgis.ncwms.currents.highResolution = function highResolution(){    
    //if it is in low resolution
    if(resolutionHigh == false){
        resolutionHigh = true;
        isLow =  false;
        updateData(); //load the streamlines of only the doamin that is display on the canvas
	//if it is in high resolution
    }else if(resolutionHigh == true & isLow == false){
        resolutionHigh = false;
        updateURL(true)
        updateData(); //load the streamlines of the entire domain
        updateURL(false)
        isLow =  true;
    }
}

/**
 * Clears the canvas by drawing an empty rectangle 
 * @returns {undefined}
 */
owgis.ncwms.currents.cleanAnimationCurrentsAll = function cleanAnimationCurrentsAll(){
    //Clears any previous display in the canvas
    abortPrevious();
    clearLoopHandlerCurrents();
    // We always start with the current grid = 0 
    owgis.ncwms.currents.particles.setCurrentGrid(0);
    owgis.ncwms.currents.particles.clearGrids();
    owgis.ncwms.currents.clearCurrentsCanvas();
}

/**
 * This function is only used to clear the current canvas. It is necessary when
 * the 'main' animation has been restarded 
 * @returns {undefined}
 */
window['owgis.ncwms.currents.clearCurrentsCanvas'] = owgis.ncwms.currents.clearCurrentsCanvas;
owgis.ncwms.currents.clearCurrentsCanvas= function clearCurrentsCanvas(){
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * This function builds the layer with the information retrieved
 * from the main layer but using the 'streamlineLayer' name. 
 * @returns {owgis.layer.model}
 */
function getDefaultLayer(){
    var bbox = layerDetails.bbox;
    bbox = bbox.map(function(x) {return Number(x)});
    /* change the projection if is necessary*/
    var defLayer = new owgis.layer.model({
	server: layerDetails.server,
	layers: layerDetails.streamlineLayer,
	bbox: bbox.join(","),
	origbbox: bbox.join(",")//,
	//srs: _map_projection
    }); 
    
    //If this layer is being server by ncWMS V2 or higher, then we 
    // need to replace the format attribute
    if(layerDetails.ncwmstwo){
        defLayer.set("format","application/prs.coverage+json");
    }	
    //If the layer has the whole longitude space (-180, 180) we modify
    // the original extent to -360,360 in order to be able to visualize
    // currents in the middle
    if(bbox[0] === -180 && bbox[2] === 180 ){
        bbox[0] = -540;
        bbox[2] = 540;
    }
    bbox = ol.proj.transformExtent(bbox, PROJ_4326, _map_projection);
    defLayer.set("origbbox",bbox);	
    return defLayer;
}

/**
 *	This function changes the requested resolution depending on:
 *	If we are displaying an animation or not
 *	If is an animation, then we need to take into account the animation resolution
 *	If we are at a mobile device or not
 * @param {type} layerTemplate
 * @returns {unresolved}
 */
function updateWidthAndHeight(layerTemplate){
    var resolutionFactor = 1;//For desktop
    if(mobile){
        resolutionFactor *= .6;//In mobile devices by default the requested resolution is reduced
    }
    if( owgis.ncwms.animation.status.current !== owgis.ncwms.animation.status.none ){ 
        resolutionFactor *= owgis.ncwms.animation.status.getResolutionRatioCurrents();
    }
    var width = Math.ceil(($(window).width()/800)*imageRequestResolution*resolutionFactor);
    var height = Math.ceil(($(window).height()/800)*imageRequestResolution*resolutionFactor);
    //console.log("Requested resolution is: "+width+" x "+height);
    layerTemplate.set("width",width);	
    layerTemplate.set("height",height);	
    return layerTemplate;
}

/**
 * Starts the streamlines when they are viewed with the Cesium 3D world 
 * @returns {undefined}
 */
function initstreamlineLayerCesium(){
    if(streamlineLayer !== null){//If the layer already existed, we remove it
        map.removeLayer(streamlineLayer);
    }
    
    c_scene = _cesium.getCesiumScene();
    c_handler = new Cesium.ScreenSpaceEventHandler(c_scene.canvas);    
    
    owgis.ncwms.currents.cleanAnimationCurrentsAll();
    updateCurrentsCesium();
    
    //When the left mouse click has been released (UP)
    c_handler.setInputAction(function(event) {
        if(c_leftdown && c_move){
            updateCurrentsCesium(event);
        }
        c_move = false;
        c_leftdown = false;
    }, Cesium.ScreenSpaceEventType.LEFT_UP);
    
    //Mouse movement
    c_handler.setInputAction(function(event) {
        if(c_leftdown){
            c_move = true;
            owgis.ncwms.currents.cleanAnimationCurrentsAll();
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    
    //Left click movement
    c_handler.setInputAction(function(event) {
        c_leftdown = true;
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);
    
    //Rotation of the mouse (ZOOM)
    c_handler.setInputAction(function(event) {
        updateCurrentsCesium(event);
    }, Cesium.ScreenSpaceEventType.WHEEL);
    
}

//--here the problem fixed
/**
 * This function is in charge of updating the extents in Cesium 
 * @param {type} event
 * @returns {undefined}
 */
function updateCurrentsCesium(event){
    canvas.width = $(window).width();
    canvas.height = $(window).height();
    var oheighty = 360;
    var nty = 90;
    var cam_rad = c_scene.camera.positionCartographic;
    _cesi = cam_rad;
    var c_center = {
	longitude:cam_rad.longitude*oheighty/Math.PI,
	latitude:cam_rad.latitude*oheighty/Math.PI
    };
    
    //This is the hight were the user see at most 70 degrees from each direction
    var def_max_angle = 70;
    var hight_for_max_angle = 8000000; 
    
    //The proportion of the window affects how much the user can sees but
    // it also should take into account how far are we
    var win_prop = canvas.width/canvas.height;
    var view_angle_lat = Math.min(def_max_angle,def_max_angle*cam_rad.height/(hight_for_max_angle*Math.max(1,win_prop)));
    var view_angle_lon = Math.min(def_max_angle,def_max_angle*cam_rad.height*Math.min(1,win_prop)/hight_for_max_angle);
    
    //In this case we have to load all the space in the longitude
    // The 20 degrees indicates when we start requesting the whole 180
    // degrees, in this case if the camera is above view_angle_lat - 20
    if( (Math.abs(c_center.latitude) + view_angle_lat - 20) > nty){
        //console.log("Max lat: " + (Math.abs(c_center.latitude) + view_angle_lat + 10));
        currentExtent = [   c_center.longitude-oheighty,
	    Math.max(-nty, c_center.latitude-view_angle_lat),
	    c_center.longitude+oheighty,
	    Math.min(nty, c_center.latitude+view_angle_lat)
	];
    }else{
        currentExtent = [   c_center.longitude-view_angle_lon,
	    c_center.latitude-view_angle_lat,
	    c_center.longitude+view_angle_lon,
	    c_center.latitude+view_angle_lat
	];
    }
    //currentExtent = ol.proj.transformExtent(currentExtent, PROJ_4326, _map_projection);
    /*
	console.log(cam_rad.height);
	console.log("****************************************************************");
	console.log("Hight: " + cam_rad.height/hight_for_max_angle);
	console.log("Win prop:" + win_prop);
	console.log("Angle lat: " + view_angle_lat);
	console.log("Angle lon: " + view_angle_lon);
	console.log("Camera center: (" + c_center.latitude + "," + c_center.longitude + ")");
	console.log("Computed extent: " + currentExtent);
     */
    
    var res = 200000000;
    var resolution = cam_rad.height/res;
    if(isFirstTime3D){
        if(updateURL(true)){
            isFirstTime3D = false;
            isFirstTime = true;
            //Trying to match the resolution obtained with the non-cesium version.
            // This is just to modify the the speed of the particles when zooming in/out            
            owgis.ncwms.currents.style.updateParticleSpeedFromResolution(resolution, currentExtent);
            updateData();
            updateURL(false);
        }
    }else{
	if(!isRunningUnderMainAnimation){
            if(updateURL(false)){
                if(event > 0 || event <= 0){  //only if you are zoom in the canvas  
                    owgis.ncwms.currents.style.updateParticleSpeedFromResolution(resolution, currentExtent);                    
                    tempULayer.set("layers",compositeLayers.split(':')[0]);//Get the proper format for U
                    tempVLayer.set("layers",compositeLayers.split(':')[1]);//Get the proper format for V
                    gridInfo = owgis.ncwms.ncwmstwo.buildGridInfo(dataCurrent, tempULayer); 
                    owgis.ncwms.currents.particles.initData(gridInfo,currentExtent);                    
                }else{
                    updateURL(true);
                    var res = 50000000;
                    var resolution = cam_rad.height/res;
                    owgis.ncwms.currents.style.updateParticleSpeedFromResolution(resolution, currentExtent);
                    //owgis.ncwms.currents.particles.initData(gridInfo,currentExtent);
                    updateData();                    
                    updateURL(false);
                }                			
            }            
        }
	
        //TODO Cesium still doesn't do animations
        /*  
        if(isFirstTime){
            if(updateURL()){
                updateData();
            }
            isFirstTime = false;
        }
	 */
    }
}

function initstreamlineLayer(){
    isFirstTime = true;
    if(streamlineLayer !== null){//If the layer already existed, we remove it
        map.removeLayer(streamlineLayer);
    }
    
    //This is the source of the new map layer
    var animSource= new ol.source.ImageCanvas({        
        canvasFunction: canvasAnimationCurrents,
        projection: _map_projection
    });
    
    streamlineLayer = new ol.layer.Image({source: animSource});
    
    var layersCollection = map.getLayers();
    if(_.isEmpty(animLayer)){
        layersCollection.insertAt(parseInt(_id_first_main_layer)+1,streamlineLayer);//Adds the animation layer just above the main layer
    }else{
        layersCollection.insertAt(parseInt(_id_first_main_layer)+2,streamlineLayer);//Adds the animation layer just above the main layer
    }
}

/**
 * Main function called by Ol3 everytime the map is updated by the user.
 * It is called when changing the zoom or panning. 
 * @param {type} extent
 * @param {type} resolution
 * @param {type} pixelRatio
 * @param {type} size
 * @param {type} projection
 * @returns {Element|canvas}
 */
function canvasAnimationCurrents(extent, resolution, pixelRatio, size, projection) {	
    //console.log("Update currents view and data");
    canvas = document.getElementById("currentsCanvas");
    var origBBOX = layerTemplate.get("origbbox");      
    
    ctx = canvas.getContext('2d');
    var canvasWidth = size[0];
    var canvasHeight = size[1];    
    
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    currentExtent = extent;
    if(isFirstTime){ // the streamlines are loaded for the first time        
        if(updateURL(isFirstTime)){                 
	    if(canvas != undefined && layerDetails.bbox[0] != -180 && layerDetails.bbox[1] != -80.03999999999999){  
		if(localStorage.zoom < 2){
		    owgis.ncwms.currents.particles.setNumParticles(2000); 
		    owgis.ncwms.currents.style.updateNumberOfParticlesSliders(2000);
		}else{
                    owgis.ncwms.currents.particles.setNumParticles(10000);
                    owgis.ncwms.currents.style.updateNumberOfParticlesSliders(10000);
		}                   
	    }else{
		owgis.ncwms.currents.particles.setNumParticles(20000);
		owgis.ncwms.currents.style.updateNumberOfParticlesSliders(20000);
	    }
            isFirstTime = false;
            isFirstTime3D = true;
            temp_resolution = resolution;
            owgis.ncwms.currents.style.updateParticleSpeedFromResolution(resolution, extent);
            //console.log('no entiendo donde se llama updateData() a cada rato');
            updateData();
            updateURL(isFirstTime)            
            //owgis.ncwms.currents.particles.initData(gridInfo,currentExtent);
        }
    }else{
        if(!isRunningUnderMainAnimation){
            if(updateURL(isFirstTime)){                
                if(resolutionHigh == true){ // if you change from high resolution to low resolution
                    isLow = false;
                    owgis.ncwms.currents.style.updateParticleSpeedFromResolution(resolution, extent);                    
                    updateData();                     
                }else{ 
                    if(temp_resolution != resolution){ //only if you are zoom in the canvas
                        temp_resolution = resolution;
                        tempULayer = layerTemplate.clone();
                        tempVLayer = layerTemplate.clone();
                        owgis.ncwms.currents.style.updateParticleSpeedFromResolution(resolution, extent);                   
                        tempULayer.set("layers",compositeLayers.split(':')[0]);//Get the proper format for U
                        tempVLayer.set("layers",compositeLayers.split(':')[1]);//Get the proper format for V                                       
                        gridInfo = owgis.ncwms.ncwmstwo.buildGridInfo(dataCurrent, tempULayer);                   
                        owgis.ncwms.currents.particles.initData(gridInfo,currentExtent);
                    }else{
                        temp_resolution = resolution;
                        owgis.ncwms.currents.style.updateParticleSpeedFromResolution(resolution, extent); 
                        owgis.ncwms.currents.particles.initData(gridInfo,currentExtent);
                    }
                }
            }            
        }
    }
    return canvas;
}

/**
 * This function is used to cancel all the previous json request that
 * haven't finish. 
 * @returns {undefined}
 */
function abortPrevious(){
    if(!_.isEmpty(readDataPremises)){
//	console.log("Canceling premises!!");
        _.each(readDataPremises, function(premise,id){
            if(!_.isEmpty(premise)){
                premise.abort();
            }
        });
    }
}

/**
 * This function Reads the json files from the server and loads the vector field
 * into the proper variables,  
 * @returns {undefined}
 */
function updateData(){
    // Clears previous animations
    owgis.ncwms.currents.cleanAnimationCurrentsAll();
    computedFileSize = estimatedFileSize*( ($(window).width()*$(window).height() ))/(800*800);
    totalRequests = times.length;	
    loadedRequests = 0;
    
    //Reads the data
    owgis.interf.loadingatmap(true,0,"Loading ");
    totalFiles = times.length;
    uData = new Array();
    vData = new Array();
    
    abortPrevious();//Abort any previous premises we have
    layerTemplate.attributes.srs = _map_projection;
    
    readDataPremises = new Array();
    if(layerDetails.ncwmstwo){
        // Iterate over all the times we are displaying (only one, unless we have animations)
        _.each(times, function(time, idx){
            layerTemplate.set("time",time);	
            //We obtain the request URLs for each vector field U and V
            compositeLayers = layerTemplate.get("layers");            
            tempULayer = layerTemplate.clone();
            tempVLayer = layerTemplate.clone();            
            tempULayer.set("layers",compositeLayers.split(':')[0]);//Get the proper format for U
            tempVLayer.set("layers",compositeLayers.split(':')[1]);//Get the proper format for V
            //Our premises are going to be 
            // (idx-1)*2 + 0 for u         and
            // (idx-1)*2 + 1 for v
            uidx = idx*2 + 0;
            vidx = idx*2 + 1;
//	    console.log("U url:", tempULayer, " V url:", tempVLayer);
            readDataPremises[uidx] = d3.json( tempULayer.getURL(), 
	    function(error, file){
//		console.log(`Data for time: ${time} U has arrived`);
		if(error){
		    console.log("Not possible to read JSON data for U: "+error.statusText);
		}else{
		    //TODO we need to be certain that this will work every case,
		    // the problem is that updateParticles gets called more than one time
		    // for each animation.
		    dataCurrent = file;
		    uData[idx] = new Array();//Clear the array for this specific location
		    gridInfo = owgis.ncwms.ncwmstwo.buildGridInfo(file, tempULayer);
		    uData[idx] = file.ranges[Object.keys(file.ranges)[0]].values;
		    //We only initialize the loop and the headers for the first request
		    if(loadedRequests === 0){
			owgis.ncwms.currents.particles.initData(gridInfo,currentExtent);
		    }
		    if( !_.isUndefined(uData[idx]) && !_.isUndefined(vData[idx])){
			if( uData[idx].length > 0 && vData[idx].length){
			    grid = owgis.ncwms.ncwmstwo.buildGrid(gridInfo,uData[idx],vData[idx]);
			    owgis.ncwms.currents.particles.setGrid(grid,idx);
			}
		    }
		    loadedRequests++;
		    owgis.interf.loadingatmap(true,Math.floor( 100*(loadedRequests/(totalRequests*2))),currentsText);
		    //Start the animation when 90% of the frames have been loaded
		    if( (loadedRequests/(totalRequests*2)) >= .99){
			owgis.interf.loadingatmap(false,0);
			startAnimationLoopCurrents();
		    }
		}
	    });
            readDataPremises[vidx] = d3.json( tempVLayer.getURL(), 
	    function(error, file){
//		console.log(`Data for time: ${time} V has arrived`);
		if(error){
		    console.log("Not possible to read JSON data for V: "+error.statusText);
		}else{
		    //TODO we need to be certain that this will work every case,
		    // the problem is that updateParticles gets called more than one time
		    // for each animation.
		    vData[idx] = new Array();
		    //We set the gridInfo only for the first time frame 
		    gridInfo = owgis.ncwms.ncwmstwo.buildGridInfo(file, tempVLayer);
		    vData[idx] = file.ranges[Object.keys(file.ranges)[0]].values;
		    //We only initialize the loop and the headers for the first request                        
		    if(loadedRequests === 0){
			owgis.ncwms.currents.particles.initData(gridInfo,currentExtent);
		    }
		    if( !_.isUndefined(uData[idx]) && !_.isUndefined(vData[idx])){
			if( uData[idx].length > 0 && vData[idx].length){
			    grid = owgis.ncwms.ncwmstwo.buildGrid(gridInfo,uData[idx],vData[idx]);
			    owgis.ncwms.currents.particles.setGrid(grid,idx);
			}
		    }
		    loadedRequests++;
		    owgis.interf.loadingatmap(true,Math.floor( 100*(loadedRequests/(totalRequests*2))), currentsText);
		    //Start the animation when 90% of the frames have been loaded
		    if( (loadedRequests/(totalRequests*2)) >= .99){
			owgis.interf.loadingatmap(false,0);
			startAnimationLoopCurrents();
		    }
		}
	    });
        });
    }else{
	console.log("The type of the layer is not ncWMSTwo, previous versions deprecated. ")
    } 
}

/**
 * This function updates the BBOX of the layers in order to modify the request.
 * The objective is to request the entire map
 * @returns {undefined}
 */
function updateURL(isFirstTime){
    var origBBOX = layerTemplate.get("origbbox");   
    if( (currentExtent[0] > origBBOX[2]) ||
	    (currentExtent[2] < origBBOX[0]) ||
	    (currentExtent[1] > origBBOX[3]) ||
	    (currentExtent[3] < origBBOX[1]) ){
	//In this case the current map view is outside the limits of the data
	return false;
    }else{
        // Updating current BBOX
        var limLonMin = Math.max(currentExtent[0], origBBOX[0]);
        var limLatMin = Math.max(currentExtent[1], origBBOX[1]);
        var limLonMax = Math.min(currentExtent[2], origBBOX[2]);
        var limLatMax = Math.min(currentExtent[3], origBBOX[3]);
        //var newbbox = [limLonMin, limLatMin, limLonMax, limLatMax];
        if(isFirstTime){
            var newbbox = [origBBOX[0], origBBOX[1],origBBOX[2], origBBOX[3]];
        }else{
            var newbbox = [limLonMin, limLatMin, limLonMax, limLatMax];
        }
        
        //layerTemplate.set("extbbox", newbbox);//auxiliar extent map
        //newbbox = ol.proj.transformExtent(newbbox, _map_projection, PROJ_4326);
        layerTemplate.set("bbox",newbbox.toString());	        
        // Updating current zaxis
        if( !_.isEmpty(layerDetails.zaxis)){
            var elev = layerDetails.zaxis.values[owgis.ncwms.zaxis.globcounter];
            layerTemplate.set("elevation",elev);	
        }else{
            layerTemplate.set("elevation",null);	
        }
        layerTemplate = updateWidthAndHeight(layerTemplate);
        return true;
    }
}

/**
 * Removes previously defined animation callback functions 
 * @returns {undefined}
 */
function clearLoopHandlerCurrents(){
    if(typeof intervalHandlerCurrents !== 'undefined'){
        clearInterval(intervalHandlerCurrents);
    }
}

/**
 * Initilizes the callback function to start the animation loop 
 * @returns {undefined}
 */
function startAnimationLoopCurrents(){
    clearLoopHandlerCurrents();
    owgis.ncwms.currents.particles.setInternalAnimationSpeed(currAnimSpeed);
    intervalHandlerCurrents = setInterval(loopAnimationCurrents,currAnimSpeed);
}

/**
 * This is the callback function in charge of displaying
 * the proper frames of the animations 
 * @returns {undefined}
 */
function loopAnimationCurrents(){
    start = Date.now();
    //When the animation is 'playing' it loops on all the frames
    if(!animationPaused){	
        ctx.beginPath();
        //Make previous ones transparent
        var prev = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = "rgba(255, 255, 255, .1)";
        ctx.fillRect(0, 0, canvas.width,canvas.height);
        ctx.globalCompositeOperation = prev;
        ctx.strokeStyle = currentsColor;
        if(mobile){
            if(_.isEmpty(_cesium) || !_cesium.getEnabled()){
		//When not Cesium and mobile
		ctx.lineWidth = defLineWidth;
            }else{
                //When Cesium is enabled
		ctx.lineWidth = defLineWidthCesium;
            }
	}else{
            ctx.lineWidth = defLineWidth;
	}
        if(_map_projection === PROJ_3857 && _cesium && _cesium.getEnabled()) {
            return;
        }
        owgis.ncwms.currents.particles.updateParticles(0, particlesArray.length);
        owgis.ncwms.currents.particles.drawParticles(0, particlesArray.length);
        ctx.stroke();
        map.render();
    }
}