document.getElementById('uploadForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const fileInput = document.getElementById('fileInput');
    if (!fileInput.files.length) return;

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    const res = await fetch('/api/read-file', {
        method: 'POST',
        body: formData
    });
    const data = await res.json();
    const contentDiv = document.getElementById('fileContent');
    if (data.content) {
        contentDiv.textContent = data.content;
    } else {
        contentDiv.textContent = data.error || '读取失败';
    }
});