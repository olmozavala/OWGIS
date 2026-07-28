# Build OWGIS WAR, then run it on Tomcat 9 (javax.servlet era).
FROM maven:3.9-eclipse-temurin-11 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn -B -DskipTests package

FROM tomcat:9.0-jdk11-temurin
LABEL org.opencontainers.image.title="OWGIS"
LABEL org.opencontainers.image.description="OWGIS 2 WebGIS template on Tomcat 9"

# Drop default apps; deploy OWGIS as the named context.
RUN rm -rf /usr/local/tomcat/webapps/*
COPY --from=build /app/target/OWGIS.war /usr/local/tomcat/webapps/OWGIS.war

EXPOSE 8080
CMD ["catalina.sh", "run"]
