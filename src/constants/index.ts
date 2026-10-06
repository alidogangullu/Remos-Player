export const SONOS_DEFAULTS = {
  UPNP_PORT: 1400,
  DISCOVERY_TIMEOUT_MS: 5000,
  SOAP_TIMEOUT_MS: 4000,
  // Actions that start media hold their response until the speaker has
  // reached the source — for a radio stream that means the service's own
  // (sometimes slow) servers, well past SOAP_TIMEOUT_MS.
  SOAP_MEDIA_START_TIMEOUT_MS: 20000,
  API_KEY: '8525505d-78e5-4dab-943f-bafe95b6074d',
  YOUTUBE_MUSIC_GOOGLE_API_KEY: 'AIzaSyDjoFM9yZcFCNRzEGeHF1FvudlHrna1dvg',
  USER_AGENT: 'Linux UPnP/1.0 Sonos/69.1-32100 (WDCR:Microsoft Windows NT 10.0.19043)',
  // Key the speaker's local Control API accepts (the one Clic and open-source
  // Sonos libraries send). Not the SMAPI API_KEY above.
  LOCAL_API_KEY: '123e4567-e89b-12d3-a456-426655440000',
};

export const UPNP_SERVICES = {
  AV_TRANSPORT: {
    CONTROL: '/MediaRenderer/AVTransport/Control',
    SERVICE: 'urn:schemas-upnp-org:service:AVTransport:1',
  },
  RENDERING_CONTROL: {
    CONTROL: '/MediaRenderer/RenderingControl/Control',
    SERVICE: 'urn:schemas-upnp-org:service:RenderingControl:1',
  },
  ZONE_GROUP_TOPOLOGY: {
    CONTROL: '/ZoneGroupTopology/Control',
    EVENT: '/ZoneGroupTopology/Event',
    SERVICE: 'urn:schemas-upnp-org:service:ZoneGroupTopology:1',
  },
  MUSIC_SERVICES: {
    CONTROL: '/MusicServices/Control',
    SERVICE: 'urn:schemas-upnp-org:service:MusicServices:1',
  },
  DEVICE_PROPERTIES: {
    CONTROL: '/DeviceProperties/Control',
    SERVICE: 'urn:schemas-upnp-org:service:DeviceProperties:1',
  },
  CONTENT_DIRECTORY: {
    CONTROL: '/MediaServer/ContentDirectory/Control',
    SERVICE: 'urn:schemas-upnp-org:service:ContentDirectory:1',
  },
};
