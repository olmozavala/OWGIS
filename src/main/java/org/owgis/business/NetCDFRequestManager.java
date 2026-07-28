/*
* Copyright (c) 2013 Olmo Zavala
* Permission is hereby granted, free of charge, to any person obtaining a copy of
* this software and associated documentation files (the "Software"), to deal in the
* Software without restriction, including without limitation the rights to use, copy,
* modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
* to permit persons to whom the Software is furnished to do so, subject to the following conditions:
* The above copyright notice and this permission notice shall be included in all copies or substantial
* portions of the Software.
*
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
* INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
* PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
* FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
* ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
/**
 * This is the class in charge of getting the request of the animations, palettes, etc of the layers on the ncWMS server.
 *
 */
package org.owgis.business;

import org.owgis.exceptions.XMLLayerException;
import org.owgis.model.Layer;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Fetches ncWMS metadata (timesteps, layer details, palettes) from remote servers.
 *
 * @author Olmo Zavala-Romero
 */
public class NetCDFRequestManager {

	/** Connect timeout when probing remote ncWMS servers (ms). */
	private static final int CONNECT_TIMEOUT_MS = 3000;
	/** Read timeout when probing remote ncWMS servers (ms). */
	private static final int READ_TIMEOUT_MS = 5000;

	/**
	 * Open an HTTP GET to {@code urlRequest} with short connect/read timeouts.
	 *
	 * @param urlRequest absolute URL to request
	 * @return open connection ready for reading the response body
	 * @throws IOException if the connection cannot be established
	 */
	private static HttpURLConnection openTimedConnection(String urlRequest) throws IOException {
		URL ncReq = new URL(urlRequest);
		HttpURLConnection connection = (HttpURLConnection) ncReq.openConnection();
		connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
		connection.setReadTimeout(READ_TIMEOUT_MS);
		connection.setRequestMethod("GET");
		connection.connect();
		return connection;
	}

	/**
	 * Read the full response body from an open HTTP connection.
	 *
	 * @param connection open HTTP connection
	 * @return response body text
	 * @throws IOException if reading fails
	 */
	private static String readResponseBody(HttpURLConnection connection) throws IOException {
		StringBuilder body = new StringBuilder();
		try (BufferedReader in = new BufferedReader(new InputStreamReader(connection.getInputStream()))) {
			String inputLine;
			while ((inputLine = in.readLine()) != null) {
				if (!inputLine.trim().isEmpty()) {
					body.append(inputLine);
				}
			}
		} finally {
			connection.disconnect();
		}
		return body.toString();
	}

	/**
	 * This functions makes a URL request to one ncWMS server to retrieve the
	 * valid animation options for the selected dates.
	 *
	 * @param layer layer to query
	 * @param startStr animation start date
	 * @param endStr animation end date
	 * @return JSON string with timesteps, or an error message string
	 */
	public static String getLayerTimeStepsForAnimation(Layer layer, String startStr, String endStr) {

		String urlRequest = buildRequest(layer, "GetMetadata", "animationTimesteps");
		urlRequest += "&start=" + startStr;
		urlRequest += "&end=" + endStr;

		JSONObject timeSteps = new JSONObject();

		try {
			HttpURLConnection connection = openTimedConnection(urlRequest);
			String body = readResponseBody(connection);
			if (!body.isEmpty()) {
				timeSteps = new JSONObject(body);
			}
		} catch (JSONException | IOException e) {
			System.out.println("Error MapViewer en RedirectServer en generateRedirect" + e.getMessage());
			return "Error getting the layerDetails:" + e.getMessage();
		}
		return timeSteps.toString();
	}

	/**
	 * This functions makes a URL request to one ncWMS server to retrieve the
	 * valid times one layer has for an specific day.
	 *
	 * @param layer layer to query
	 * @param day day string expected by ncWMS
	 * @return JSON string with timesteps, or an error message string
	 */
	public static String getLayerTimeSteps(Layer layer, String day) {

		String urlRequest = buildRequest(layer, "GetMetadata", "timesteps");
		urlRequest += "&day=" + day;

		JSONObject timeSteps = new JSONObject();

		try {
			HttpURLConnection connection = openTimedConnection(urlRequest);
			String body = readResponseBody(connection);
			if (!body.isEmpty()) {
				timeSteps = new JSONObject(body);
			}
		} catch (JSONException | IOException e) {
			System.out.println("Error MapViewer en RedirectServer en generateRedirect" + e.getMessage());
			return "Error getting the layer Time Steps:" + e.getMessage();
		}
		return timeSteps.toString();
	}

	/**
	 * Obtains the layerDetails from a ncWMS server and stores the result as a
	 * string (from a JSON object) this is then the javascript variable layerDetails.
	 *
	 * @param layer layer to query
	 * @return JSON string with layer details
	 * @throws XMLLayerException if details cannot be loaded after retries
	 */
	public static String getLayerDetails(Layer layer) throws XMLLayerException {

		//For the moment we only obtain the datails for netCDF layers (ncWMS server)
		if (!layer.isncWMS()) {
			return "";
		}

		String detailsRequest = buildRequest(layer, "GetMetadata", "layerDetails");
		System.out.println("Layer details for layer " + layer.getName() + ": " + detailsRequest);
		JSONObject layerDetails = new JSONObject();

		int maxTries = 2; //Number of tries we willl make to retrieve an specific layer
		int tryNumber = 0;// Current try
		boolean accepted = false;

		while (!accepted && (tryNumber < maxTries)) {
			try {
				HttpURLConnection connection = openTimedConnection(detailsRequest);
				String layerDetailsSTR = readResponseBody(connection);

				layerDetails = new JSONObject(layerDetailsSTR);

				// If minColor and maxColor are set in the xml file, we replace
				// the JSONObject of LayerDetails
				if (!((layer.getMinColor() == -1) && (layer.getMaxColor() == -1))) {
					JSONArray scale = layerDetails.getJSONArray("scaleRange");
					scale.put(0, layer.getMinColor());
					scale.put(1, layer.getMaxColor());
				}

				accepted = true;
			} catch (JSONException | IOException e) {
				try {
					tryNumber++;
					System.out.println("Layer details try number:" + tryNumber + " for layer "
							+ layer.getName() + " Error:" + e.getMessage());
					Thread.sleep(200);
				} catch (InterruptedException ex) {
					System.out.println("Interrupted exception while waiting for layer details:" + ex.getMessage());
					Thread.currentThread().interrupt();
				}
			}
		}

		if (accepted) {
			return layerDetails.toString();
		} else {
			throw new XMLLayerException("ERROR: Not able to load layer details for layer:" + layer.getName());
		}
	}

	/**
	 * Gets the URL used to request the image of the color palette to a ncWMS
	 * server.
	 *
	 * @param layer layer that owns the palette
	 * @param palette palette name
	 * @return legend graphic URL, or empty string when not applicable
	 */
	public static String getPaletteUrl(Layer layer, String palette) {

		if (layer == null || !layer.isncWMS()) {
			return "";
		}

		String paletteUrl = layer.getServer() + "?REQUEST=GetLegendGraphic"
				+ "&LAYER=" + layer.getName()
				+ "&COLORBARONLY=true"
				+ "&PALETTE=" + palette
				+ "&WIDTH=20&HEIGHT=100"
				+ "&NUMCOLORBANDS=250";

		return paletteUrl;
	}

	/**
	 * Build the http request URL for ncWMS metadata.
	 *
	 * @param layer layer providing server and name
	 * @param request WMS request type
	 * @param item ncWMS metadata item
	 * @return request URL string
	 */
	private static String buildRequest(Layer layer, String request, String item) {
		String server = layer.getServer();

		String localAddress = layer.getLocalAddress();
		if (localAddress != null) {
			server = localAddress;
		}

		String layerName = layer.getName();

		String httpReq = server + "?";
		httpReq += "REQUEST=" + request;
		httpReq += "&item=" + item;
		httpReq += "&layerName=" + layerName;

		return httpReq;
	}
}
