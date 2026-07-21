import { getAccessToken } from './authService';

export const findOrCreateFolder = async (folderName: string, parentId?: string): Promise<string> => {
  const token = await getAccessToken();
  let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }
  
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const searchData = await searchRes.json();
  
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }
  
  const body: any = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder'
  };
  if (parentId) {
    body.parents = [parentId];
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const createData = await createRes.json();
  const newFolderId = createData.id;

  // Make readable
  await fetch(`https://www.googleapis.com/drive/v3/files/${newFolderId}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      role: 'reader',
      type: 'anyone'
    })
  });

  return newFolderId;
};

export const uploadBlobToNestedDrive = async (blob: Blob, fileName: string, parentFolderName: string, childFolderName: string): Promise<{ id: string; url: string }> => {
  const token = await getAccessToken();
  if (!token) throw new Error("No Google Drive access token available.");

  const rootFolderId = await findOrCreateFolder(parentFolderName);
  const targetFolderId = await findOrCreateFolder(childFolderName, rootFolderId);

  const metadata = {
    name: fileName,
    mimeType: blob.type || 'application/pdf',
    parents: [targetFolderId]
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: form
  });

  if (!res.ok) {
     const text = await res.text();
     throw new Error("Upload failed: " + text);
  }

  const data = await res.json();
  
  // Also make file readable just in case
  await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ role: 'reader', type: 'anyone' })
  });

  return { id: data.id, url: data.webViewLink };
};

export const getFilesFromFolder = async (folderName: string, parentFolderName: string = 'Extras_app'): Promise<any[]> => {
  const token = await getAccessToken();
  if (!token) return [];

  try {
    const parentId = await findOrCreateFolder(parentFolderName);
    let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${parentId}' in parents`;
    
    // Find child folder
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const searchData = await searchRes.json();
    if (!searchData.files || searchData.files.length === 0) return [];

    const folderId = searchData.files[0].id;

    // List all files inside the child folder
    const filesQuery = `'${folderId}' in parents and trashed=false`;
    const filesRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(filesQuery)}&fields=files(id,name,webViewLink)`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const filesData = await filesRes.json();
    return filesData.files || [];
  } catch (error) {
    console.error("Error fetching files from drive:", error);
    return [];
  }
};

export const uploadFileToDrive = async (file: File, folderName: string = 'Anexos - SGRP'): Promise<{ id: string; url: string }> => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("No Google Drive access token available. Please sign in.");
  }

  // 1. Find or create the folder
  let folderId = null;
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const searchData = await searchRes.json();
  
  if (searchData.files && searchData.files.length > 0) {
    folderId = searchData.files[0].id;
  } else {
    // Create folder
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
      })
    });
    const createData = await createRes.json();
    folderId = createData.id;

    // Make folder publicly readable so commanders can access the links
    await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone'
      })
    });
  }

  const metadata = {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    parents: [folderId]
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: form,
  });

  if (!res.ok) {
    throw new Error('Failed to upload file to Google Drive');
  }

  const data = await res.json();
  
  // Make the file itself publicly readable just in case
  await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      role: 'reader',
      type: 'anyone'
    })
  });

  return { id: data.id, url: data.webViewLink };
};

export const downloadFileFromDrive = async (fileId: string): Promise<Blob> => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("Não foi possível obter o token de acesso do Google Drive.");
  }
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Falha ao baixar arquivo do Google Drive: ${text}`);
  }
  return await res.blob();
};
