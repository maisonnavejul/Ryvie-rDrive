import { useEffect, useRef, useState } from 'react';
import { useRecoilState } from 'recoil';
import { CreateModalAtom } from '.';
import { Button } from '@atoms/button/button';
import { Input } from '@atoms/input/input-text';
import { Base } from '@atoms/text';
import Languages from "features/global/services/languages-service";

export const CreateDocument = ({
  addFromUrl,
  url,
  defaultFilename,
  docTypeName,
}: {
  addFromUrl: (url: string, name: string) => void;
  url: string;
  defaultFilename: string;
  docTypeName: string;
}) => {
  // Extract extension from default filename (e.g. "Untitled.docx" -> ".docx")
  const ext = defaultFilename.includes('.') ? '.' + defaultFilename.split('.').pop() : '';
  const [name, setName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [state, setState] = useRecoilState(CreateModalAtom);
  const inputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTimeout(() => {
      const firstInput = inputRef.current && inputRef.current.querySelector("input") as HTMLInputElement;
      if (firstInput)
        firstInput.focus();
    }, 100);
  }, []);

  const createDocumentHandler = async () => {
    const finalName = (name || '').trim();
    if (!finalName) return;
    setLoading(true);
    addFromUrl(url, finalName + ext);
    setState({ ...state, open: false });
  };

  return (
    <>
      <Base className="!font-medium">
        {Languages.t('components.create_document_modal.hint', [], `Choisissez un nom pour le nouveau document (${docTypeName}).`)}
      </Base>
      <div ref={inputRef}>
        <Input
          disabled={loading}
          placeholder={Languages.t('components.create_document_modal.placeholder', [], 'Nom du document')}
          className="w-full mt-4"
          onKeyDown={(e: any) => {
            if (e.keyCode === 13) {
              e.preventDefault();
              if (e.target.value)
                createDocumentHandler();
            }
          }}
          onChange={(e: any) => setName(e.target.value)}
          testClassId="create-document-input"
        />
      </div>
      <Button
        disabled={!(name || '').trim()}
        loading={loading}
        className="mt-4 float-right"
        onClick={createDocumentHandler}
        testClassId="create-document-button"
      >
        {Languages.t('components.create_document_modal.button', [], 'Créer')}
      </Button>
    </>
  );
};
