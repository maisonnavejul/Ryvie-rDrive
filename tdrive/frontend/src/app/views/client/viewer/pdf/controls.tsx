import { Button } from '@atoms/button/button';
import { ZoomOutIcon, ZoomInIcon } from '@atoms/icons-agnostic';
import { getPdfControls } from './display';

export default () => {
  return (
    <>
      <Button
        iconSize="md"
        className="!rounded-full !bg-white/10 hover:!bg-white/20"
        theme="dark"
        size="sm"
        icon={ZoomOutIcon}
        onClick={() => getPdfControls().zoomOut()}
        testClassId="pdf-control-button-zoom-out"
      />
      <Button
        iconSize="md"
        className="!rounded-full !bg-white/10 hover:!bg-white/20"
        theme="dark"
        size="sm"
        icon={ZoomInIcon}
        onClick={() => getPdfControls().zoomIn()}
        testClassId="pdf-control-button-zoom-in"
      />
    </>
  );
};
