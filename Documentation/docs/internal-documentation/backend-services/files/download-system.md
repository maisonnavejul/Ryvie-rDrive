---
description: Secure Download System for Files and Folders in Twake Drive
---

# 📥 Download System

## Overview

The Twake Drive download system provides a secure and user-friendly way to download both individual files and folders (as ZIP archives). It leverages JWT authentication and cookie credentials to ensure secure downloads while providing a seamless user experience with notifications.

## Security Features

### Authentication System

The download system implements a dual authentication approach to ensure secure file access:

1. **JWT Token Authentication**:
   - All download requests include a Bearer token in the Authorization header
   - The token is automatically retrieved from JWT storage service
   - Example: `Authorization: Bearer eyJhbGciOiJ...`

2. **Cookie-based Authentication**:
   - All requests include credentials with the `credentials: 'include'` option
   - This ensures that cookies are sent with cross-origin requests
   - Provides a fallback authentication mechanism for browsers with restricted headers

### URL Structure

Download URLs are constructed securely without exposing sensitive tokens directly in browser history or bookmarks:

```typescript
// Example of secure URL construction
const url = Api.route(`/internal/services/documents/v1/companies/${companyId}/item/${id}/download`);
```

## User Experience Enhancements

### Download Notifications

The system provides visual feedback during the entire download process:

1. **Preparation Phase**:
   - Shows "Preparing [filename] for download..." notification
   - Indicates to users that their request is being processed
   - Uses `ToasterService.loading()` for persistent notification

2. **Completion Notification**:
   - Shows success message once download is complete
   - Customized based on content type (file, folder, multiple files)
   - Example: "Dossier [name] téléchargé avec succès"

### Filename Preservation

Files downloaded through the system maintain their original filenames:

1. **Content-Disposition Extraction**:
   - Parses `Content-Disposition` headers to extract the correct filename
   - Falls back to URL-derived names if header is not available
   - Handles special characters and encoding issues

2. **Programmatic Download**:
   - Uses the Blob API and URL.createObjectURL to trigger downloads
   - Creates temporary anchor elements to preserve filenames
   - Properly cleans up object URLs after download to prevent memory leaks

## Implementation Details

### File Download Process

```typescript
// 1. Show preparation notification
const hideLoading = ToasterService.loading(messageText, 0);

// 2. Set up authentication
const jwt = jwtStorageService.getJWT();
const authHeader = `Bearer ${jwt}`;

// 3. Fetch with authentication
fetch(fileUrl, {
  method: 'GET',
  credentials: 'include',
  headers: { Authorization: authHeader },
})

// 4. Process response and extract filename
.then(response => {
  // Extract filename from Content-Disposition
  const contentDisposition = response.headers.get('Content-Disposition');
  // ...
  return response.blob();
})

// 5. Trigger download with correct filename
.then(blob => {
  const url = window.URL.createObjectURL(blob);
  const downloadLink = document.createElement('a');
  downloadLink.href = url;
  downloadLink.download = fileName;
  // ...
  
  // 6. Show completion notification
  hideLoading();
  ToasterService.success(successMessage);
})
```

### ZIP Download for Folders

The system handles folder downloads by:

1. Converting folders to ZIP archives on the server side
2. Showing appropriate preparation messages during the process
3. Using the folder name as the ZIP filename
4. Maintaining secure authentication during the entire process

## Internationalization

The download system is fully internationalized with support for multiple languages:

- English: "Preparing folder [name] for download..."
- French: "Préparation du dossier [name] pour téléchargement..."

All notification messages use the translation system with dynamic parameters:
```typescript
Languages.t('hooks.use-drive-actions.preparing_folder_with_name', [folderName])
```

## Browser Compatibility

The download system works across all major browsers including:

- Chrome, Firefox, Safari (Desktop)
- Mobile browsers (with some limitations based on device capabilities)
- Legacy browsers (with graceful degradation)

## Error Handling

The system provides comprehensive error handling:

1. **Connection Issues**:
   - Shows clear error messages when download fails
   - Handles network interruptions gracefully

2. **Server Errors**:
   - Provides user-friendly messages for 401, 403, and 500 errors
   - Logs detailed error information for debugging

## Future Improvements

Potential future enhancements to the download system include:

1. **Real Progress Tracking**:
   - Implement true download progress tracking using ReadableStream and response.body
   - Show actual file size and downloaded percentage

2. **Resumable Downloads**:
   - Add support for resuming interrupted downloads
   - Implement HTTP Range requests for large files

3. **Bandwidth Optimization**:
   - Adaptive quality for media files based on connection speed
   - Optimized compression for different file types
