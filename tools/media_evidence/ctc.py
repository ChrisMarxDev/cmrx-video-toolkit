"""CTC Viterbi alignment of supplied token IDs; independent of model/runtime I/O."""

def align(logits, tokens, blank=0):
    import numpy as np
    scores = np.asarray(logits, dtype=np.float64)
    if scores.ndim != 2 or not np.isfinite(scores).all() or not tokens:
        raise ValueError('CTC requires finite [frames, vocabulary] logits and tokens')
    if any(t == blank or not 0 <= t < scores.shape[1] for t in tokens):
        raise ValueError('Invalid CTC token')
    # Extended blank/token states permit staying, advancing, and skipping a blank
    # only between different tokens. Repeated letters must traverse a blank.
    labels = np.full(2*len(tokens)+1, blank, dtype=int); labels[1::2] = tokens
    lp = scores - scores.max(axis=1, keepdims=True)
    lp -= np.log(np.exp(lp).sum(axis=1, keepdims=True))
    states = len(labels)
    previous = np.full(states, -np.inf); previous[0] = lp[0, blank]; previous[1] = lp[0, tokens[0]]
    back = np.zeros((len(lp), states), dtype=np.uint8)
    skip = np.zeros(states, dtype=bool)
    skip[2:] = (labels[2:] != blank) & (labels[2:] != labels[:-2])
    for frame in range(1, len(lp)):
        choices = np.stack([previous, np.r_[-np.inf, previous[:-1]], np.r_[-np.inf, -np.inf, previous[:-2]]])
        choices[2, ~skip] = -np.inf
        best = choices.argmax(axis=0)
        back[frame] = best
        previous = choices[best, np.arange(states)] + lp[frame, labels]
    state = states-1 if previous[-1] >= previous[-2] else states-2
    if not np.isfinite(previous[state]):
        return None
    frames = [[] for _ in tokens]
    for frame in range(len(lp)-1, -1, -1):
        if state % 2:
            frames[state//2].append(frame)
        state -= int(back[frame, state])
    if any(not f for f in frames):
        return None
    return [dict(start=min(f), end=max(f)+1,
                 score=float(np.exp(np.mean(lp[f, token])))) for f, token in zip(frames, tokens)]
