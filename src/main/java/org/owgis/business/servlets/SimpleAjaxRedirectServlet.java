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
/*
 * To change this template, choose Tools | Templates
 * and open the template in the editor.
 */
package org.owgis.business.servlets;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.net.MalformedURLException;
import java.net.URL;
import java.util.logging.Level;
import java.util.logging.Logger;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

/**
 * This servlet is used to avoid the 'cross origin' problem. It makes the call
 * of the received url and returns the result as a string. 
 * @author Olmo Zavala
 */
public class SimpleAjaxRedirectServlet extends HttpServlet {

    /**
     * Processes requests for both HTTP
     * <code>GET</code> and
     * <code>POST</code> methods.
     *
     * @param request servlet request
     * @param response servlet response
     * @throws ServletException if a servlet-specific error occurs
     * @throws IOException if an I/O error occurs
     */
    protected void processRequest(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        response.setContentType("text/html;charset=iso-8859-1");
        //variable 'server' we put the data of the request. 
        PrintWriter out = response.getWriter();
        synchronized (this) {
            String reqResult = "";
            try {
				String url = request.getParameter("url");
                reqResult = obtainRedirectText(url);
                //Sends the final request back
                out.println(reqResult);
            } catch (Exception e) {
                Logger.getLogger(RedirectServersServlet.class.getName()).log(Level.SEVERE, "Error MapViewer en Redirect en ProcessRequest" + e.getMessage(), e);
            } finally {
                out.close();
            }
        }
    }


    // <editor-fold defaultstate="collapsed" desc="HttpServlet methods. Click on the + sign on the left to edit the code.">
    /**
     * Handles the HTTP
     * <code>GET</code> method.
     *
     * @param request servlet request
     * @param response servlet response
     * @throws ServletException if a servlet-specific error occurs
     * @throws IOException if an I/O error occurs
     */
    @Override
        protected void doGet(HttpServletRequest request, HttpServletResponse response)
        throws ServletException, IOException {
        processRequest(request, response);
        }

    /**
     * Handles the HTTP
     * <code>POST</code> method.
     *
     * @param request servlet request
     * @param response servlet response
     * @throws ServletException if a servlet-specific error occurs
     * @throws IOException if an I/O error occurs
     */
    @Override
        protected void doPost(HttpServletRequest request, HttpServletResponse response)
        throws ServletException, IOException {
        processRequest(request, response);
        }

    /**
     * Returns a short description of the servlet.
     *
     * @return a String containing servlet description
     */
    @Override
        public String getServletInfo() {
            return "Short description";
        }// </editor-fold>

    /**
     * Fetch the remote URL text used by browser AJAX proxies.
     * Retries briefly on failure. When {@code localhost}/{@code 127.0.0.1} fails
     * (common when Tomcat runs in Docker), retries via {@code host.docker.internal}.
     *
     * @param url absolute URL requested by the browser
     * @return response body, or an error message if all attempts fail
     */
    private String obtainRedirectText(String url) {
        String result = tryObtainRedirectText(url);
        if (result != null && !result.startsWith("Failed to call:")) {
            return result;
        }
        String rewritten = rewriteLoopbackForDocker(url);
        if (rewritten != null && !rewritten.equals(url)) {
            System.out.println("Retrying simpleAjaxRedirect via " + rewritten);
            result = tryObtainRedirectText(rewritten);
        }
        return result == null ? ("Failed to call: " + url) : result;
    }

    /**
     * Rewrite loopback hosts so containerized Tomcat can reach services on the host.
     *
     * @param url original absolute URL
     * @return rewritten URL, or the original string if no rewrite applies
     */
    private String rewriteLoopbackForDocker(String url) {
        if (url == null) {
            return null;
        }
        return url
                .replace("://localhost:", "://host.docker.internal:")
                .replace("://127.0.0.1:", "://host.docker.internal:");
    }

    /**
     * Attempt to fetch {@code url} with short timeouts and a few retries.
     *
     * @param url absolute URL to fetch
     * @return response body, or {@code Failed to call: ...} on exhaustion
     */
    private String tryObtainRedirectText(String url) {
        String result = "";
        boolean finish = false;
        int numberOfRetries = 3;
        int retry = 0;
        int connectTimeoutMs = 3000;
        int readTimeoutMs = 8000;

        while (!finish && retry < numberOfRetries) {
            retry++;
            try {
                URL owgis = new URL(url);
                java.net.HttpURLConnection connection =
                        (java.net.HttpURLConnection) owgis.openConnection();
                connection.setConnectTimeout(connectTimeoutMs);
                connection.setReadTimeout(readTimeoutMs);
                connection.setRequestMethod("GET");

                int status = connection.getResponseCode();
                java.io.InputStream stream = status >= 400
                        ? connection.getErrorStream()
                        : connection.getInputStream();
                if (stream == null) {
                    finish = false;
                    continue;
                }

                result = "";
                try (BufferedReader in = new BufferedReader(new InputStreamReader(stream))) {
                    String inputLine;
                    while ((inputLine = in.readLine()) != null) {
                        if (inputLine.contains("Internal error occurred")) {
                            result = "";
                            break;
                        }
                        // Skip known garbage markers from older GeoServer responses.
                        if (inputLine.contains("\u0003") || inputLine.contains("??")) {
                            finish = false;
                            break;
                        }
                        result += inputLine;
                        finish = true;
                    }
                }
                connection.disconnect();
            } catch (IOException ex) {
                Logger.getLogger(SimpleAjaxRedirectServlet.class.getName())
                        .log(Level.SEVERE, "Error in obtainRedirectText: " + ex.getMessage(), ex);
                finish = false;
            }
        }
        if (!finish) {
            result = "Failed to call: " + url;
        }
        return result;
    }
}
