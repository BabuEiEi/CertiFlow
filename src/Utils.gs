/**
 * Utility Functions & Standard Response Builders
 */
const Utils = {
  /**
   * Build standard API response
   * @param {boolean} success
   * @param {*} data
   * @param {string|null} error
   * @return {Object}
   */
  buildResponse(success, data = null, error = null) {
    return {
      success: success,
      data: data,
      error: error,
      requestId: Utilities.getUuid()
    };
  }
};
