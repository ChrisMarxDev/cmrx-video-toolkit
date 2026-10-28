"""Map measured source words through retained ranges without changing edit/review files."""
import argparse
from pathlib import Path
from .common import digest, entrypoint, identity, output_directory, read, timeline_document, verify_source, write
from .speech import validate_evidence


def map_words(report, timeline):
    words, excluded = [], []
    for word in report['words']:
        if word['status'] != 'aligned':
            excluded.append(dict(id=word['id'], reason=word['status'])); continue
        a, b = word['source_start'], word['source_end']
        intersecting = [s for s in timeline['spans'] if max(a,s['source_start']) < min(b,s['source_end'])]
        if not intersecting:
            excluded.append(dict(id=word['id'], reason='removed')); continue
        whole = next((s for s in intersecting if s['source_start'] <= a and b <= s['source_end']), None)
        if whole is None:
            excluded.append(dict(id=word['id'], reason='partial_word')); continue
        offset = whole['output_start']-whole['source_start']
        words.append(dict(**word, clip_id=whole['clip_id'], start=a+offset, end=b+offset))
    return dict(format='mapped-speech', version=1, time_base='output', source=report['source'],
                timeline_revision=timeline['revision'], timeline_sha256=digest(timeline),
                speech_sha256=digest(report), words=words, excluded=excluded, human_review_required=True)


def srt(words):
    def stamp(seconds):
        ms = round(seconds*1000)
        return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
    return ''.join(f"{i+1}\n{stamp(w['start'])} --> {stamp(w['end'])}\n{w['text']}\n\n" for i,w in enumerate(words))


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('source','speech','timeline','output'):
        p.add_argument('--'+name,required=True)
    a=p.parse_args(); source=identity(a.source); timeline=timeline_document(a.timeline,source)
    report=validate_evidence(read(a.speech),source)
    with output_directory(a.output) as out:
        mapped=map_words(report,timeline); write(out/'words.json',mapped)
        (out/'words.srt').write_text(srt(mapped['words']),encoding='utf-8')
        verify_source(source)
        if digest(timeline_document(a.timeline,source)) != digest(timeline):
            raise ValueError('Timeline changed while mapping words')
    print(str(Path(a.output).resolve()/'words.json'))


if __name__=='__main__':
    entrypoint(main)
